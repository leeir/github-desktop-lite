import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCommitMessageSuggestion } from '../../../src/lib/ai/commit-prompt'

describe('parseCommitMessageSuggestion', () => {
  it('parses object payloads', () => {
    assert.deepEqual(
      parseCommitMessageSuggestion(
        '{"title":"Fix token renewal","description":"Preserve credentials"}'
      ),
      { title: 'Fix token renewal', description: 'Preserve credentials' }
    )
  })

  it('rejects arrays, null, and primitives as non-object payloads', () => {
    for (const content of [
      '[]',
      '[{"title":"Not an object"}]',
      'null',
      '"text"',
      '42',
      'true',
    ]) {
      assert.throws(() => parseCommitMessageSuggestion(content), {
        message:
          'The model returned an invalid commit message payload: expected an object',
      })
    }
  })
})
