import assert from 'node:assert/strict'
import { describe, it, TestContext } from 'node:test'
import { chmod, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { Repository } from '../../../src/models/repository'
import { git } from '../../../src/lib/git/core'
import { pullCurrentBranch } from '../../../src/lib/git/pull-current-branch'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { createTempDirectory } from '../../helpers/temp'

async function fixture(t: TestContext) {
  const source = await setupEmptyRepository(t, 'main')
  await makeCommit(source, {
    entries: [{ path: 'file.txt', contents: 'base' }],
  })
  const root = await createTempDirectory(t)
  const remotePath = join(root, 'remote.git')
  await git(['clone', '--bare', '--', source.path, remotePath], root, 'test')
  const path = join(root, 'local')
  await git(['clone', '--', remotePath, path], root, 'test')
  const repository = new Repository(path, 1, null, false)
  const advanceRemote = async (branch = 'main') => {
    await makeCommit(source, {
      entries: [{ path: 'file.txt', contents: `incoming ${branch}` }],
    })
    await git(['push', '--', remotePath, branch], source.path, 'test')
  }
  return { source, repository, remotePath, advanceRemote }
}

async function head(repository: Repository, ref = 'HEAD') {
  const { stdout } = await git(
    ['rev-parse', '--verify', ref],
    repository.path,
    'test'
  )
  return stdout.trim()
}

describe('pullCurrentBranch', () => {
  it('pulls the current branch without changing other local branches', async t => {
    const { repository, source, advanceRemote } = await fixture(t)
    await git(['branch', 'other'], repository.path, 'test')
    const oldTip = await head(repository)
    await advanceRemote()

    const result = await pullCurrentBranch(repository)

    assert.equal(result.status, 'updated')
    assert.equal(result.branch, 'main')
    assert.equal(await head(repository), await head(source))
    assert.equal(await head(repository, 'other'), oldTip)
    assert.equal(
      await readFile(join(repository.path, 'file.txt'), 'utf8'),
      'incoming main'
    )
  })

  it('follows a feature branch on a remote other than origin', async t => {
    const { source, repository, remotePath, advanceRemote } = await fixture(t)
    await git(['checkout', '-b', 'feature'], source.path, 'test')
    await git(['push', '--', remotePath, 'feature'], source.path, 'test')
    await git(['remote', 'rename', 'origin', 'team'], repository.path, 'test')
    await git(['fetch', 'team'], repository.path, 'test')
    await git(
      ['checkout', '-b', 'local-feature', '--track', 'team/feature'],
      repository.path,
      'test'
    )
    const mainTip = await head(repository, 'main')
    await advanceRemote('feature')

    const result = await pullCurrentBranch(repository)

    assert.equal(result.status, 'updated')
    assert.equal(result.branch, 'local-feature')
    assert.equal(await head(repository), await head(source))
    assert.equal(await head(repository, 'main'), mainTip)
  })

  it('reports repositories already up to date', async t => {
    const { repository } = await fixture(t)
    assert.equal((await pullCurrentBranch(repository)).status, 'up-to-date')
  })

  it('preserves local-only commits when there are no incoming commits', async t => {
    const { repository } = await fixture(t)
    await makeCommit(repository, {
      entries: [{ path: 'local.txt', contents: 'local' }],
    })
    const tip = await head(repository)
    assert.equal((await pullCurrentBranch(repository)).status, 'up-to-date')
    assert.equal(await head(repository), tip)
  })

  for (const change of ['unstaged', 'staged', 'untracked']) {
    it(`skips ${change} changes without stashing or updating HEAD`, async t => {
      const { repository, advanceRemote } = await fixture(t)
      await advanceRemote()
      const tip = await head(repository)
      const path = join(
        repository.path,
        change === 'untracked' ? 'new.txt' : 'file.txt'
      )
      await writeFile(path, 'local edits')
      if (change === 'staged') {
        await git(['add', 'file.txt'], repository.path, 'test')
      }
      const result = await pullCurrentBranch(repository)

      assert.equal(result.status, 'skipped')
      assert.match(result.message, /Uncommitted changes/)
      assert.equal(await head(repository), tip)
      assert.equal(await readFile(path, 'utf8'), 'local edits')
      assert.equal(
        (await git(['stash', 'list'], repository.path, 'test')).stdout,
        ''
      )
    })
  }

  it('skips divergence even when rebase and autostash are configured', async t => {
    const { repository, advanceRemote } = await fixture(t)
    await advanceRemote()
    await makeCommit(repository, {
      entries: [{ path: 'local.txt', contents: 'local' }],
    })
    await git(['config', 'pull.rebase', 'true'], repository.path, 'test')
    await git(['config', 'rebase.autoStash', 'true'], repository.path, 'test')
    const tip = await head(repository)

    const result = await pullCurrentBranch(repository)

    assert.equal(result.status, 'skipped')
    assert.match(result.message, /diverged/)
    assert.equal(await head(repository), tip)
    assert.equal(
      (await git(['status', '--porcelain'], repository.path, 'test')).stdout,
      ''
    )
  })

  it('does not overwrite an ignored local file that becomes tracked upstream', async t => {
    const { repository, source, remotePath } = await fixture(t)
    await writeFile(join(repository.path, '.git/info/exclude'), 'private.txt\n')
    await writeFile(join(repository.path, 'private.txt'), 'local data')
    await makeCommit(source, {
      entries: [{ path: 'private.txt', contents: 'remote data' }],
    })
    await git(['push', '--', remotePath, 'main'], source.path, 'test')
    const tip = await head(repository)

    await assert.rejects(pullCurrentBranch(repository))

    assert.equal(await head(repository), tip)
    assert.equal(
      await readFile(join(repository.path, 'private.txt'), 'utf8'),
      'local data'
    )
  })

  it('skips branches without upstream configuration', async t => {
    const { repository } = await fixture(t)
    await git(['branch', '--unset-upstream'], repository.path, 'test')
    const result = await pullCurrentBranch(repository)
    assert.equal(result.status, 'skipped')
    assert.match(result.message, /no upstream/)
  })

  it('skips detached HEAD and unborn branches', async t => {
    const { repository } = await fixture(t)
    await git(['checkout', '--detach'], repository.path, 'test')
    assert.equal((await pullCurrentBranch(repository)).status, 'skipped')
    const unborn = await setupEmptyRepository(t)
    assert.equal((await pullCurrentBranch(unborn)).status, 'skipped')
  })

  it('keeps HEAD unchanged when the upstream cannot be fetched', async t => {
    const { repository } = await fixture(t)
    const tip = await head(repository)
    await git(
      ['remote', 'set-url', 'origin', join(repository.path, 'missing.git')],
      repository.path,
      'test'
    )
    await assert.rejects(pullCurrentBranch(repository))
    assert.equal(await head(repository), tip)
  })

  it('preserves edits made while fetching', async t => {
    const { repository, advanceRemote } = await fixture(t)
    await advanceRemote()
    const tip = await head(repository)
    const hook = join(repository.path, '.git/hooks/reference-transaction')
    await writeFile(
      hook,
      '#!/bin/sh\nif [ "$1" = committed ]; then printf "edited during fetch" > file.txt; fi\n'
    )
    await chmod(hook, 0o755)

    const result = await pullCurrentBranch(repository)

    assert.equal(result.status, 'skipped')
    assert.match(result.message, /Uncommitted changes/)
    assert.equal(await head(repository), tip)
    assert.equal(
      await readFile(join(repository.path, 'file.txt'), 'utf8'),
      'edited during fetch'
    )
  })

  it('skips a repository whose branch changed while fetching', async t => {
    const { repository, advanceRemote } = await fixture(t)
    await git(['branch', 'other'], repository.path, 'test')
    await advanceRemote()
    const tip = await head(repository)
    const hook = join(repository.path, '.git/hooks/reference-transaction')
    await writeFile(
      hook,
      '#!/bin/sh\nif [ "$1" = committed ]; then printf "ref: refs/heads/other\\n" > .git/HEAD; fi\n'
    )
    await chmod(hook, 0o755)

    const result = await pullCurrentBranch(repository)

    assert.equal(result.status, 'skipped')
    assert.match(result.message, /changed while fetching/)
    assert.equal(await head(repository), tip)
    assert.equal(await head(repository, 'main'), tip)
    assert.equal(
      (
        await git(['symbolic-ref', '--short', 'HEAD'], repository.path, 'test')
      ).stdout.trim(),
      'other'
    )
  })
})
