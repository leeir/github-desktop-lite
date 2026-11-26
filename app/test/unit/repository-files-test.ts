import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'fs/promises'
import * as Path from 'path'
import { tmpdir } from 'os'
import {
  readRepositoryDirectory,
  readRepositoryFile,
  MaxPreviewBytes,
  MaxDirectoryEntries,
} from '../../src/lib/repository-files'

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(Path.join(tmpdir(), 'lite-files-unit-'))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('repository file browser', () => {
  it('lists one level, folders first, including untracked and ignored files but excluding Git internals', () =>
    fixture(async root => {
      await mkdir(Path.join(root, 'src', 'nested'), { recursive: true })
      await mkdir(Path.join(root, '.git'))
      await writeFile(Path.join(root, '.git', 'config'), 'private git data')
      await writeFile(Path.join(root, '.env'), 'LOCAL=value')
      await writeFile(Path.join(root, 'untracked.ts'), 'export const value = 1')
      const result = await readRepositoryDirectory(root, '')
      assert.deepEqual(
        result.entries.map(e => e.name),
        ['src', '.env', 'untracked.ts']
      )
      assert.equal(result.limited, false)
      assert.deepEqual(
        (await readRepositoryDirectory(root, 'src')).entries.map(e => e.name),
        ['nested']
      )
    }))
  it('reads UTF-8 text, CRLF and empty files', () =>
    fixture(async root => {
      await writeFile(
        Path.join(root, 'code.ts'),
        'const name = "你好"\r\nexport { name }\r\n'
      )
      const preview = await readRepositoryFile(root, 'code.ts')
      assert.equal(preview.kind, 'text')
      if (preview.kind === 'text') {
        assert.deepEqual(preview.lines, [
          'const name = "你好"',
          'export { name }',
          '',
        ])
        assert.equal(preview.limited, false)
      }
      await writeFile(Path.join(root, 'empty'), '')
      assert.deepEqual(await readRepositoryFile(root, 'empty'), {
        kind: 'text',
        lines: [''],
        size: 0,
        limited: false,
      })
    }))
  it('bounds bytes, lines and long generated lines without reading an entire large file', () =>
    fixture(async root => {
      await writeFile(Path.join(root, 'large.txt'), 'line\n'.repeat(200000))
      const preview = await readRepositoryFile(root, 'large.txt')
      assert.equal(preview.kind, 'text')
      if (preview.kind === 'text') {
        assert.equal(preview.limited, true)
        assert.equal(preview.lines.length, 10000)
        assert.equal(preview.size, 1000000)
      }
      await writeFile(
        Path.join(root, 'minified.js'),
        'x'.repeat(MaxPreviewBytes - 1) + '你好'
      )
      const minified = await readRepositoryFile(root, 'minified.js')
      assert.equal(minified.kind, 'text')
      if (minified.kind === 'text') {
        assert.equal(minified.limited, true)
        assert.equal(minified.lines[0].length, 4001)
      }
    }))
  it('does not attempt to render binary or non-UTF8 files', () =>
    fixture(async root => {
      await writeFile(Path.join(root, 'image.bin'), Buffer.from([0, 1, 2, 3]))
      await writeFile(
        Path.join(root, 'invalid.bin'),
        Buffer.from([0xff, 0xfe, 0xff])
      )
      assert.equal((await readRepositoryFile(root, 'image.bin')).kind, 'binary')
      assert.equal(
        (await readRepositoryFile(root, 'invalid.bin')).kind,
        'binary'
      )
      assert.equal((await readRepositoryFile(root, '')).kind, 'unsupported')
    }))
  it('rejects path escapes, Git internals and both file and directory symlinks', () =>
    fixture(async root => {
      await mkdir(Path.join(root, '.git'))
      await writeFile(Path.join(root, '.git', 'config'), 'private')
      await writeFile(Path.join(root, 'local.txt'), 'hello')
      await symlink(Path.join(root, 'local.txt'), Path.join(root, 'link.txt'))
      await symlink(tmpdir(), Path.join(root, 'outside'))
      await assert.rejects(
        readRepositoryFile(root, '../outside'),
        /outside the repository/
      )
      await assert.rejects(
        readRepositoryFile(root, Path.join(root, 'local.txt')),
        /outside the repository/
      )
      await assert.rejects(
        readRepositoryFile(root, '.git/config'),
        /Git internal/
      )
      await assert.rejects(
        readRepositoryFile(root, 'link.txt'),
        /Symbolic links/
      )
      await assert.rejects(
        readRepositoryDirectory(root, 'outside'),
        /Symbolic links/
      )
      const result = await readRepositoryDirectory(root, '')
      assert.equal(
        result.entries.find(e => e.name === 'link.txt')?.kind,
        'link'
      )
    }))
  it('bounds the size of unusually large directories', () =>
    fixture(async root => {
      for (let i = 0; i <= MaxDirectoryEntries; i++) {
        await writeFile(Path.join(root, `${i}.txt`), '')
      }
      const result = await readRepositoryDirectory(root, '')
      assert.equal(result.entries.length, MaxDirectoryEntries)
      assert.equal(result.limited, true)
    }))
  it('reports a file removed by an external tool without retaining old contents', () =>
    fixture(async root => {
      await assert.rejects(readRepositoryFile(root, 'deleted.ts'), {
        code: 'ENOENT',
      })
    }))
})
