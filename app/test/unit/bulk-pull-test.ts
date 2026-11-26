import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Repository } from '../../src/models/repository'
import { IBulkPullState } from '../../src/models/bulk-pull'
import { runBulkPull } from '../../src/lib/bulk-pull'

describe('runBulkPull', () => {
  it('deduplicates repositories and continues after failures, with immutable progress snapshots', async () => {
    const first = new Repository('/repo/first', 1, null, false)
    const second = new Repository('/repo/second', 2, null, false)
    const third = new Repository('/repo/third', 3, null, false)
    const calls: number[] = []
    const updates: IBulkPullState[] = []

    await runBulkPull(
      [first, second, first, third],
      async repository => {
        calls.push(repository.id)
        if (repository.id === 2) {
          throw new Error('Remote is unavailable')
        }
        return { status: 'updated', branch: 'main', message: 'Pulled.' }
      },
      state => updates.push(state)
    )

    assert.deepEqual(calls, [1, 2, 3])
    assert.equal(updates[0].results.length, 0)
    assert.equal(updates[0].total, 3)
    assert.equal(updates[2].currentRepository, third)
    const final = updates.at(-1)!
    assert.equal(final.running, false)
    assert.equal(final.currentRepository, null)
    assert.deepEqual(
      final.results.map(r => r.status),
      ['updated', 'failed', 'updated']
    )
    assert.equal(final.results[1].message, 'Remote is unavailable')
  })

  it('finishes an empty batch without starting an operation', async () => {
    const updates: IBulkPullState[] = []
    await runBulkPull(
      [],
      () => {
        throw new Error('Unexpected pull')
      },
      state => updates.push(state)
    )
    assert.deepEqual(updates, [
      { running: false, total: 0, currentRepository: null, results: [] },
    ])
  })
})
