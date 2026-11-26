import * as Path from 'path'
import { constants } from 'fs'
import { lstat, realpath, opendir, open } from 'fs/promises'

export const MaxDirectoryEntries = 5000
export const MaxPreviewBytes = 256 * 1024
const MaxPreviewLines = 10000
const MaxLineLength = 4000

export interface IRepositoryEntry {
  readonly name: string
  readonly path: string
  readonly kind: 'directory' | 'file' | 'link' | 'other'
}

export interface IRepositoryDirectory {
  readonly entries: ReadonlyArray<IRepositoryEntry>
  readonly limited: boolean
}

export type RepositoryFilePreview =
  | {
      readonly kind: 'text'
      readonly lines: ReadonlyArray<string>
      readonly size: number
      readonly limited: boolean
    }
  | { readonly kind: 'binary' | 'unsupported'; readonly size: number }

/** Resolve only paths inside the working tree, without following child links. */
async function resolveWorkingTreePath(root: string, relativePath: string) {
  const base = await realpath(root)
  const target = Path.resolve(base, relativePath)
  const relative = Path.relative(base, target)
  if (
    Path.isAbsolute(relativePath) ||
    relative === '..' ||
    relative.startsWith(`..${Path.sep}`) ||
    Path.isAbsolute(relative)
  ) {
    throw new Error('This path is outside the repository.')
  }
  let current = base
  for (const part of relative.split(Path.sep).filter(Boolean)) {
    if (part.toLowerCase() === '.git') {
      throw new Error('Git internal files are not part of this view.')
    }
    current = Path.join(current, part)
    if ((await lstat(current)).isSymbolicLink()) {
      throw new Error('Symbolic links are not followed in file preview.')
    }
  }
  return target
}

/** Read one directory only. No recursive walk, Git command, or index. */
export async function readRepositoryDirectory(
  root: string,
  relativePath: string
): Promise<IRepositoryDirectory> {
  const target = await resolveWorkingTreePath(root, relativePath)
  const directory = await opendir(target)
  const entries: IRepositoryEntry[] = []
  let limited = false
  // Async iteration closes the directory handle, including on early exit.
  for await (const entry of directory) {
    if (entry.name.toLowerCase() === '.git') {
      continue
    }
    if (entries.length >= MaxDirectoryEntries) {
      limited = true
      break
    }
    entries.push({
      name: entry.name,
      path: Path.join(relativePath, entry.name),
      kind: entry.isSymbolicLink()
        ? 'link'
        : entry.isDirectory()
        ? 'directory'
        : entry.isFile()
        ? 'file'
        : 'other',
    })
  }
  entries.sort(
    (a, b) =>
      Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
      a.name.localeCompare(b.name, undefined, { numeric: true })
  )
  return { entries, limited }
}

/** Bounded asynchronous reads, including for generated/minified files. */
export async function readRepositoryFile(
  root: string,
  relativePath: string
): Promise<RepositoryFilePreview> {
  const target = await resolveWorkingTreePath(root, relativePath)
  const info = await lstat(target)
  if (!info.isFile()) {
    return { kind: 'unsupported', size: info.size }
  }
  const file = await open(
    target,
    constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0)
  )
  try {
    const stat = await file.stat()
    if (!stat.isFile()) {
      return { kind: 'unsupported', size: stat.size }
    }
    const buffer = Buffer.alloc(Math.min(stat.size, MaxPreviewBytes))
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    let limited = stat.size > bytesRead
    const bytes = buffer.subarray(0, bytesRead)
    if (bytes.includes(0)) {
      return { kind: 'binary', size: stat.size }
    }
    let text: string
    try {
      // Stream decoding tolerates a UTF-8 character cut at the byte limit.
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes, {
        stream: limited,
      })
    } catch {
      return { kind: 'binary', size: stat.size }
    }
    const allLines = text.split(/\r\n|\n|\r/)
    limited ||= allLines.length > MaxPreviewLines
    const lines = allLines.slice(0, MaxPreviewLines).map(line => {
      if (line.length > MaxLineLength) {
        limited = true
        return line.slice(0, MaxLineLength) + '…'
      }
      return line
    })
    return { kind: 'text', lines, size: stat.size, limited }
  } finally {
    await file.close()
  }
}
