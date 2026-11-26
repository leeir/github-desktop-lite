import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import * as Path from 'path'
import { tmpdir } from 'os'
import { exec } from 'dugite'
import {
  searchRepositoryFiles,
  findInPreview,
  MaxFilenameMatches,
  MaxCodeMatches,
} from '../../src/lib/repository-file-search'

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(Path.join(tmpdir(), 'lite-search-unit-'))
  try {
    assert.equal((await exec(['init'], root)).exitCode, 0)
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('lightweight file search', () => {
  it('searches tracked and untracked paths, excluding ignored directories and Git internals', () =>
    fixture(async root => {
      await mkdir(Path.join(root, 'src'))
      await mkdir(Path.join(root, 'node_modules'))
      await writeFile(Path.join(root, '.gitignore'), 'node_modules/\n')
      await writeFile(Path.join(root, 'src', 'Review.tsx'), 'export {}')
      await writeFile(Path.join(root, 'src', 'review-new.ts'), '')
      await writeFile(Path.join(root, 'node_modules', 'review.ts'), '')
      await exec(['add', 'src/Review.tsx'], root)
      const result = await searchRepositoryFiles(
        root,
        'REVIEW',
        new AbortController().signal
      )
      assert.deepEqual(result.entries.map(e => e.path).sort(), [
        'src/Review.tsx',
        'src/review-new.ts',
      ])
      assert.equal(result.limited, false)
      assert.equal(
        (
          await searchRepositoryFiles(
            root,
            'src/review',
            new AbortController().signal
          )
        ).entries.length,
        2
      )
      assert.equal(
        (
          await searchRepositoryFiles(
            root,
            '.git/config',
            new AbortController().signal
          )
        ).entries.length,
        0
      )
    }))
  it('preserves Unicode, whitespace and literal glob characters in filenames', () =>
    fixture(async root => {
      const name = '你好 [one]\nfile.ts'
      await writeFile(Path.join(root, name), '')
      const result = await searchRepositoryFiles(
        root,
        '[one]',
        new AbortController().signal
      )
      assert.equal(result.entries[0].path, name)
      assert.equal(
        (
          await searchRepositoryFiles(
            root,
            '你好',
            new AbortController().signal
          )
        ).entries.length,
        1
      )
    }))
  it('bounds results and reports partial results', () =>
    fixture(async root => {
      for (let i = 0; i < MaxFilenameMatches + 20; i++) {
        await writeFile(Path.join(root, `item-${i}.ts`), '')
      }
      const result = await searchRepositoryFiles(
        root,
        'item-',
        new AbortController().signal
      )
      assert.equal(result.entries.length, MaxFilenameMatches)
      assert.equal(result.limited, true)
    }))
  it('cancels a live request and does no work for an empty query', () =>
    fixture(async root => {
      const controller = new AbortController()
      const promise = searchRepositoryFiles(root, 'anything', controller.signal)
      controller.abort()
      await assert.rejects(promise, /cancelled/)
      await assert.rejects(
        searchRepositoryFiles(root, 'anything', controller.signal),
        /cancelled/
      )
      assert.deepEqual(
        await searchRepositoryFiles(
          '/not/a/repository',
          '  ',
          new AbortController().signal
        ),
        { entries: [], limited: false }
      )
    }))
  it('reports invalid roots instead of silently returning no matches', async () => {
    await assert.rejects(
      searchRepositoryFiles(
        '/not/a/repository',
        'file',
        new AbortController().signal
      )
    )
  })
  it('finds literal, case-insensitive code matches with correct UTF-16 offsets', () => {
    assert.deepEqual(findInPreview(['😀 Foo [x] foo', 'FOO'], 'foo'), {
      matches: [
        { line: 0, start: 3, length: 3 },
        { line: 0, start: 11, length: 3 },
        { line: 1, start: 0, length: 3 },
      ],
      limited: false,
    })
    assert.deepEqual(findInPreview(['a.*[x]b'], '.*[x]').matches, [
      { line: 0, start: 1, length: 5 },
    ])
    assert.equal(findInPreview(['İtarget'], 'target').matches[0].start, 1)
    assert.equal(findInPreview(['你好你好'], '你好').matches.length, 2)
    assert.equal(findInPreview(['abc'], '').matches.length, 0)
    assert.equal(findInPreview(['abc'], 'missing').matches.length, 0)
  })
  it('caps repeated code matches without scanning beyond the preview', () => {
    const result = findInPreview(['x'.repeat(MaxCodeMatches + 5)], 'x')
    assert.equal(result.matches.length, MaxCodeMatches)
    assert.equal(result.limited, true)
    assert.equal(
      findInPreview(['x'.repeat(MaxCodeMatches)], 'x').limited,
      false
    )
  })
})
