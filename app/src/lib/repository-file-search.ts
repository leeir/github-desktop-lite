import { spawn } from 'dugite'
import * as Path from 'path'
import { IRepositoryEntry } from './repository-files'

export const MaxFilenameMatches = 200
export const MaxCodeMatches = 1000

export interface IFilenameMatches {
  readonly entries: ReadonlyArray<IRepositoryEntry>
  readonly limited: boolean
}

/** Stream paths from Git, never file contents or a persistent repository index. */
export function searchRepositoryFiles(
  root: string,
  query: string,
  signal: AbortSignal
): Promise<IFilenameMatches> {
  if (signal.aborted) {
    return Promise.reject(new Error('Search cancelled'))
  }
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return Promise.resolve({ entries: [], limited: false })
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      [
        '--no-optional-locks',
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--deduplicate',
        '-z',
      ],
      root
    )
    const entries: IRepositoryEntry[] = []
    const seen = new Set<string>()
    let pending = ''
    let bytes = 0
    let settled = false
    const finish = (limited: boolean, error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      if (child.exitCode === null) {
        child.kill()
      }
      if (error !== undefined) {
        reject(error)
      } else {
        resolve({ entries, limited })
      }
    }
    const abort = () => finish(false, new Error('Search cancelled'))
    const timeout = setTimeout(() => finish(true), 10000)
    signal.addEventListener('abort', abort, { once: true })
    child.stdin.end()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (settled) {
        return
      }
      bytes += Buffer.byteLength(chunk)
      if (bytes > 32 * 1024 * 1024) {
        finish(true)
        return
      }
      pending += chunk
      let end: number
      let start = 0
      while ((end = pending.indexOf('\0', start)) !== -1) {
        const path = pending.slice(start, end)
        start = end + 1
        if (!path.toLowerCase().includes(needle) || seen.has(path)) {
          continue
        }
        if (entries.length === MaxFilenameMatches) {
          finish(true)
          return
        }
        seen.add(path)
        entries.push({ name: Path.basename(path), path, kind: 'file' })
      }
      pending = pending.slice(start)
      if (pending.length > 64 * 1024) {
        finish(true)
      }
    })
    // Drain stderr without accumulating arbitrary Git output in memory.
    child.stderr.resume()
    child.on('error', error => finish(false, error))
    child.on('close', code =>
      finish(
        false,
        code === 0
          ? undefined
          : new Error(
              'Could not search this repository. Refresh and try again.'
            )
      )
    )
  })
}

export interface ICodeMatch {
  readonly line: number
  readonly start: number
  readonly length: number
}

/** Literal, case-insensitive search of the already bounded text preview. */
export function findInPreview(lines: ReadonlyArray<string>, query: string) {
  const matches: ICodeMatch[] = []
  if (query.length === 0) {
    return { matches, limited: false }
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(escaped, 'giu')
  for (let line = 0; line < lines.length; line++) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(lines[line])) !== null) {
      if (matches.length === MaxCodeMatches) {
        return { matches, limited: true }
      }
      matches.push({ line, start: match.index, length: match[0].length })
    }
  }
  return { matches, limited: false }
}
