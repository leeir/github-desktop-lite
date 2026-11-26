import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  AIProviderPresets,
  CustomProviderId,
  getAIConnection,
  getAIProviderPreset,
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

  it('ask for a key from every provider but the custom one', () => {
    for (const preset of AIProviderPresets) {
      assert.equal(
        preset.keyUrl === undefined,
        preset.id === CustomProviderId,
        preset.id
      )
    }
  })

  it('are all hosted: no local model providers', () => {
    assert.equal(getAIProviderPreset('ollama'), undefined)
    assert.equal(getAIProviderPreset('lmstudio'), undefined)
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

  it('uses overrides for the custom provider', () => {
    const custom = getAIProviderPreset(CustomProviderId)!
    assert.equal(
      getEffectiveBaseUrl(custom, ' https://llm.example.com/v1 '),
      'https://llm.example.com/v1'
    )
    assert.equal(getEffectiveBaseUrl(custom, undefined), custom.baseUrl)
  })
})

describe('isValidBaseUrl', () => {
  it('requires https', () => {
    assert.ok(isValidBaseUrl('https://api.example.com/v1'))
    assert.ok(!isValidBaseUrl('http://api.example.com/v1'))
    assert.ok(!isValidBaseUrl('not a url'))
  })

  it('rejects local model servers', () => {
    assert.ok(!isValidBaseUrl('http://localhost:11434/v1'))
    for (const host of [
      'localhost',
      'ollama.localhost.',
      'mac.local',
      '127.0.0.2',
      '[::1]',
      '192.168.1.2',
      '[::ffff:127.0.0.1]',
    ]) {
      const url = `https://${host}/v1`
      assert.ok(!isValidBaseUrl(url), host)
      assert.throws(() =>
        getAIConnection(getAIProviderPreset(CustomProviderId)!, url, null)
      )
    }
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

describe('AI settings persistence', () => {
  it('round-trips through local storage', () => {
    saveAISettings({
      providerId: 'custom',
      model: 'qwen',
      baseUrl: 'https://llm.example.com/v1',
    })
    assert.deepStrictEqual(loadAISettings(), {
      providerId: 'custom',
      model: 'qwen',
      baseUrl: 'https://llm.example.com/v1',
    })

    saveAISettings(null)
    assert.equal(loadAISettings(), null)
  })

  it('reopens settings with no provider selected for retired local configurations', () => {
    for (const providerId of ['ollama', 'lmstudio', CustomProviderId]) {
      saveAISettings({
        providerId,
        model: 'old-model',
        baseUrl: 'http://localhost:1234/v1',
      })
      assert.equal(loadAISettings(), null)
    }
    saveAISettings(null)
  })

  it('treats corrupt settings as unset', () => {
    localStorage.setItem('ai-settings', '{"providerId": 1}')
    assert.equal(loadAISettings(), null)
    localStorage.setItem('ai-settings', 'not json')
    assert.equal(loadAISettings(), null)
    localStorage.removeItem('ai-settings')
  })
})
