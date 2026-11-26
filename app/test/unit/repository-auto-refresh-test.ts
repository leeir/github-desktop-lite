import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  classifyWatchPath,
  shouldIgnoreWatchPath,
} from '../../src/ui/lib/repository-auto-refresh'

describe('classifyWatchPath', () => {
  it('classifies normal workspace files and index changes as working-tree', () => {
    assert.strictEqual(classifyWatchPath('src/app.tsx'), 'working-tree')
    assert.strictEqual(classifyWatchPath('README.md'), 'working-tree')
    assert.strictEqual(classifyWatchPath('.git/index'), 'working-tree')
    assert.strictEqual(shouldIgnoreWatchPath('src/app.tsx'), false)
  })

  it('classifies ref/head updates and coarse null paths as full refresh', () => {
    assert.strictEqual(classifyWatchPath(null), 'full')
    assert.strictEqual(classifyWatchPath(''), 'full')
    assert.strictEqual(classifyWatchPath('.git/HEAD'), 'full')
    assert.strictEqual(classifyWatchPath('.git/refs/heads/main'), 'full')
    assert.strictEqual(classifyWatchPath('.git/worktrees/wt1/HEAD'), 'full')
    assert.strictEqual(shouldIgnoreWatchPath('.git/HEAD'), false)
  })

  it('ignores transient git internals, lock files, and noisy directories', () => {
    assert.strictEqual(classifyWatchPath('.git'), 'ignore')
    assert.strictEqual(classifyWatchPath('.git/index.lock'), 'ignore')
    assert.strictEqual(classifyWatchPath('.git/objects/ab/1234'), 'ignore')
    assert.strictEqual(classifyWatchPath('.git/logs/HEAD'), 'ignore')
    assert.strictEqual(classifyWatchPath('.git/COMMIT_EDITMSG'), 'ignore')
    assert.strictEqual(classifyWatchPath('.DS_Store'), 'ignore')
    assert.strictEqual(classifyWatchPath('packages/a/.DS_Store'), 'ignore')
    assert.strictEqual(classifyWatchPath('node_modules/pkg/index.js'), 'ignore')
    assert.strictEqual(classifyWatchPath('.Trash/file.ts'), 'ignore')
    assert.strictEqual(shouldIgnoreWatchPath('.git/objects/ab/1234'), true)
  })
})
