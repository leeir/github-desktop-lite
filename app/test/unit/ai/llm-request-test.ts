import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  buildCompletionRequest,
  buildListModelsRequest,
  extractCompletionText,
  extractErrorMessage,
  extractModelIds,
  ILLMConnection,
  ILLMRequest,
} from '../../../src/lib/ai/llm-request'

function makeRequest(connection: ILLMConnection): ILLMRequest {
  return {
    id: 'req-1',
    connection,
    model: 'my-model',
    systemPrompt: 'system',
    userPrompt: 'user',
    timeoutMs: 1000,
  }
}

describe('buildCompletionRequest', () => {
  it('builds an OpenAI-compatible chat completions request', () => {
    const http = buildCompletionRequest(
      makeRequest({
        format: 'openai',
        baseUrl: 'https://openrouter.ai/api/v1/',
        apiKey: 'k',
      })
    )

    assert.equal(http.url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(http.method, 'POST')
    assert.equal(http.headers.Authorization, 'Bearer k')
    assert.deepStrictEqual(JSON.parse(http.body ?? ''), {
      model: 'my-model',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
    })
  })

  it('sends no credentials when there is no key', () => {
    const http = buildCompletionRequest(
      makeRequest({ format: 'openai', baseUrl: 'http://localhost:11434/v1' })
    )

    assert.equal(http.url, 'http://localhost:11434/v1/chat/completions')
    assert.equal(http.headers.Authorization, undefined)
  })

  it('builds an Anthropic messages request', () => {
    const http = buildCompletionRequest(
      makeRequest({
        format: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'k',
      })
    )

    assert.equal(http.url, 'https://api.anthropic.com/v1/messages')
    assert.equal(http.headers['x-api-key'], 'k')
    assert.equal(http.headers['anthropic-version'], '2023-06-01')
    const body = JSON.parse(http.body ?? '')
    assert.equal(body.system, 'system')
    assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'user' }])
    assert.ok(body.max_tokens > 0)
  })

  it('does not duplicate the version segment for Anthropic proxies', () => {
    const http = buildCompletionRequest(
      makeRequest({ format: 'anthropic', baseUrl: 'https://proxy.example/v1' })
    )

    assert.equal(http.url, 'https://proxy.example/v1/messages')
  })
})

describe('buildListModelsRequest', () => {
  it('lists OpenAI-compatible models', () => {
    const http = buildListModelsRequest({
      format: 'openai',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'k',
    })

    assert.equal(http.url, 'https://api.deepseek.com/models')
    assert.equal(http.method, 'GET')
    assert.equal(http.headers.Authorization, 'Bearer k')
    assert.equal(http.body, undefined)
  })

  it('lists Anthropic models', () => {
    const http = buildListModelsRequest({
      format: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'k',
    })

    assert.equal(http.url, 'https://api.anthropic.com/v1/models?limit=1000')
    assert.equal(http.headers['x-api-key'], 'k')
  })
})

describe('extractCompletionText', () => {
  it('reads chat completion string content', () => {
    assert.equal(
      extractCompletionText('openai', {
        choices: [{ message: { content: 'hi' } }],
      }),
      'hi'
    )
  })

  it('reads chat completion content parts', () => {
    assert.equal(
      extractCompletionText('openai', {
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: 'a' },
                { type: 'text', text: 'b' },
              ],
            },
          },
        ],
      }),
      'ab'
    )
  })

  it('skips Anthropic thinking blocks', () => {
    assert.equal(
      extractCompletionText('anthropic', {
        content: [
          { type: 'thinking', thinking: 'hmm' },
          { type: 'text', text: 'answer' },
        ],
      }),
      'answer'
    )
  })

  it('returns null for unexpected shapes', () => {
    assert.equal(extractCompletionText('openai', null), null)
    assert.equal(extractCompletionText('openai', { choices: [] }), null)
    assert.equal(extractCompletionText('anthropic', {}), null)
  })
})

describe('extractModelIds', () => {
  it('reads, deduplicates and sorts `data[].id`', () => {
    assert.deepStrictEqual(
      extractModelIds({
        data: [{ id: 'gpt-4o' }, { id: 'deepseek-chat' }, { id: 'gpt-4o' }],
      }),
      ['deepseek-chat', 'gpt-4o']
    )
  })

  it("reads Ollama's native `models[].name`", () => {
    assert.deepStrictEqual(
      extractModelIds({ models: [{ name: 'qwen2.5-coder:7b' }] }),
      ['qwen2.5-coder:7b']
    )
  })

  it('returns null when there is no list', () => {
    assert.equal(extractModelIds({ object: 'error' }), null)
    assert.equal(extractModelIds('nope'), null)
  })
})

describe('extractErrorMessage', () => {
  it('understands the common error shapes', () => {
    assert.equal(
      extractErrorMessage({ error: { message: 'bad key' } }),
      'bad key'
    )
    assert.equal(extractErrorMessage({ error: 'nope' }), 'nope')
    assert.equal(extractErrorMessage({ message: 'oops' }), 'oops')
    assert.equal(extractErrorMessage('text'), null)
  })
})
