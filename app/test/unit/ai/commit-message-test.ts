import assert from 'node:assert'
import { describe, it, Mock } from 'node:test'
import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { ipcRenderer } from 'electron'
import {
  extractCommitMessageJson,
  generateCommitMessage,
  truncateDiffForPrompt,
} from '../../../src/lib/ai/commit-message'
import { CommitMessageGenerationCancelledError } from '../../../src/lib/ai/commit-prompt'
import type { IAISettings } from '../../../src/lib/ai/providers'
import type { ILLMRequest, LLMResult } from '../../../src/lib/ai/llm-request'

const invoke = ipcRenderer.invoke as unknown as Mock<
  (channel: string, request: ILLMRequest) => Promise<LLMResult>
>

// Local providers need no key, so the keychain isn't involved.
const settings: IAISettings = { providerId: 'ollama', model: 'qwen' }

function patch(path: string, body: string) {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${body}\n`
}

describe('truncateDiffForPrompt', () => {
  it('leaves small diffs untouched', () => {
    const diff = patch('a.ts', '+x')
    assert.equal(truncateDiffForPrompt(diff, 1000), diff)
  })

  it('keeps the raw summary and every file within the budget', () => {
    const summary =
      ':100644 100644 aaa bbb M\ta.ts\n:100644 100644 ccc ddd M\tb.ts\n\n'
    const diff =
      summary +
      patch('a.ts', '+'.repeat(5000)) +
      patch('b.ts', '-'.repeat(5000))

    const result = truncateDiffForPrompt(diff, 3000)

    assert.ok(result.length <= 3000)
    assert.ok(result.startsWith(summary))
    assert.ok(result.includes('diff --git a/a.ts'))
    assert.ok(result.includes('diff --git a/b.ts'))
    assert.ok(result.includes('[... truncated'))
  })

  it('omits patches that no longer fit and says so', () => {
    const diff = Array.from({ length: 20 }, (_, i) =>
      patch(`f${i}.ts`, '+'.repeat(1000))
    ).join('')

    const result = truncateDiffForPrompt(diff, 2000)

    assert.ok(result.length <= 2000)
    assert.match(result, /more file patches omitted/)
  })
})

describe('extractCommitMessageJson', () => {
  it('drops reasoning before the answer', () => {
    assert.equal(
      extractCommitMessageJson('<think>pondering {}</think>\n{"title":"x"}'),
      '{"title":"x"}'
    )
  })

  it('pulls the object out of surrounding prose', () => {
    assert.equal(
      extractCommitMessageJson(
        'Sure! Here it is:\n{"title":"x"}\nHope it helps.'
      ),
      '{"title":"x"}'
    )
  })

  it('leaves fenced replies for the parser', () => {
    const fenced = '```json\n{"title":"x"}\n```'
    assert.equal(extractCommitMessageJson(fenced), fenced)
  })
})

describe('generateCommitMessage', () => {
  it('sends the diff and repository instructions to the provider', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'ai-commit-'))
    await mkdir(join(repo, '.github'))
    await writeFile(
      join(repo, '.github', 'copilot-instructions.md'),
      'Use Conventional Commits.'
    )

    let sent: ILLMRequest | undefined
    invoke.mock.mockImplementation(async (_channel, req) => {
      sent = req
      return {
        kind: 'ok',
        text: '<think>ok</think>{"title":"feat: add x","description":"Adds x."}',
      }
    })

    const message = await generateCommitMessage(
      settings,
      patch('x.ts', '+x'),
      repo,
      [],
      new AbortController().signal
    )

    assert.deepStrictEqual(message, {
      title: 'feat: add x',
      description: 'Adds x.',
    })
    assert.equal(invoke.mock.calls.at(-1)?.arguments[0], 'ai-complete')
    assert.ok(sent !== undefined)
    assert.equal(sent.model, 'qwen')
    assert.deepStrictEqual(sent.connection, {
      format: 'openai',
      baseUrl: 'http://localhost:11434/v1',
    })
    assert.match(sent.systemPrompt, /Use Conventional Commits\./)
    assert.match(sent.userPrompt, /diff --git a\/x\.ts/)
  })

  it('surfaces provider errors', async () => {
    invoke.mock.mockImplementation(async () => ({
      kind: 'error',
      message: 'The model provider returned 401: bad key',
    }))

    await assert.rejects(
      generateCommitMessage(
        settings,
        patch('x.ts', '+x'),
        tmpdir(),
        [],
        new AbortController().signal
      ),
      /401: bad key/
    )
  })

  it('rejects replies that are not a commit message', async () => {
    invoke.mock.mockImplementation(async () => ({
      kind: 'ok',
      text: 'I cannot help with that.',
    }))

    await assert.rejects(
      generateCommitMessage(
        settings,
        patch('x.ts', '+x'),
        tmpdir(),
        [],
        new AbortController().signal
      ),
      /did not reply with a usable commit message/
    )
  })

  it('treats a cancelled request as cancellation', async () => {
    invoke.mock.mockImplementation(async () => ({ kind: 'cancelled' }))

    await assert.rejects(
      generateCommitMessage(
        settings,
        patch('x.ts', '+x'),
        tmpdir(),
        [],
        new AbortController().signal
      ),
      CommitMessageGenerationCancelledError
    )
  })

  it('rejects unknown providers', async () => {
    await assert.rejects(
      generateCommitMessage(
        { providerId: 'gone', model: 'x' },
        patch('x.ts', '+x'),
        tmpdir(),
        [],
        new AbortController().signal
      ),
      /no longer available/
    )
  })
})
