import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  AIProviderPresets,
  CustomProviderId,
  getAIConnection,
  getAIProviderPreset,
  getAITimeoutMs,
  getEffectiveBaseUrl,
  isValidBaseUrl,
  loadAISettings,
  saveAISettings,
} from '../../../src/lib/ai/providers'

describe('AI provider presets', () => {
  it('have unique ids and valid base URLs', () => {
    const ids = AIProviderPresets.map(p => p.id)
    assert.equal(new Set(ids).size, ids.length)

    for (const preset of AIProviderPresets) {
      if (preset.id === CustomProviderId) {
        assert.equal(preset.baseUrl, '')
      } else {
        assert.ok(isValidBaseUrl(preset.baseUrl), preset.id)
      }
    }
  })

  it('ask for a key only from cloud providers', () => {
    for (const preset of AIProviderPresets) {
      assert.equal(
        preset.keyUrl === undefined,
        preset.local === true || preset.id === CustomProviderId,
        preset.id
      )
    }
  })
})

describe('getEffectiveBaseUrl', () => {
  it('ignores overrides for fixed providers', () => {
    const openai = getAIProviderPreset('openai')!
    assert.equal(
      getEffectiveBaseUrl(openai, 'https://evil.example'),
      'https://api.openai.com/v1'
    )
  })

  it('uses overrides for local and custom providers', () => {
    const ollama = getAIProviderPreset('ollama')!
    assert.equal(
      getEffectiveBaseUrl(ollama, ' http://localhost:9999/v1 '),
      'http://localhost:9999/v1'
    )
    assert.equal(getEffectiveBaseUrl(ollama, undefined), ollama.baseUrl)
  })
})

describe('isValidBaseUrl', () => {
  it('requires https for remote hosts', () => {
    assert.ok(isValidBaseUrl('https://api.example.com/v1'))
    assert.ok(!isValidBaseUrl('http://api.example.com/v1'))
    assert.ok(!isValidBaseUrl('not a url'))
  })

  it('allows http on this computer', () => {
    assert.ok(isValidBaseUrl('http://localhost:11434/v1'))
    assert.ok(isValidBaseUrl('http://127.0.0.2:1234/v1'))
    assert.ok(isValidBaseUrl('http://[::1]:1234/v1'))
  })
})

describe('getAIConnection', () => {
  it('uses the preset format and only includes a key when present', () => {
    const anthropic = getAIProviderPreset('anthropic')!
    assert.deepStrictEqual(getAIConnection(anthropic, undefined, 'k'), {
      format: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'k',
    })
    assert.equal(getAIConnection(anthropic, undefined, null).apiKey, undefined)
  })
})

describe('getAITimeoutMs', () => {
  it('gives local models more time', () => {
    const ollama = getAIProviderPreset('ollama')!
    const openai = getAIProviderPreset('openai')!
    assert.ok(
      getAITimeoutMs(ollama, ollama.baseUrl) >
        getAITimeoutMs(openai, openai.baseUrl)
    )
  })
})

describe('AI settings persistence', () => {
  it('round-trips through local storage', () => {
    saveAISettings({ providerId: 'ollama', model: 'qwen', baseUrl: 'x' })
    assert.deepStrictEqual(loadAISettings(), {
      providerId: 'ollama',
      model: 'qwen',
      baseUrl: 'x',
    })

    saveAISettings(null)
    assert.equal(loadAISettings(), null)
  })

  it('treats corrupt settings as unset', () => {
    localStorage.setItem('ai-settings', '{"providerId": 1}')
    assert.equal(loadAISettings(), null)
    localStorage.setItem('ai-settings', 'not json')
    assert.equal(loadAISettings(), null)
    localStorage.removeItem('ai-settings')
  })
})
