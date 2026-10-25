import { isIPv4 } from 'net'
import { TokenStore } from '../stores/token-store'
import { ILLMConnection, LLMApiFormat } from './llm-request'

/** A model provider the user can pick from a list. */
export interface IAIProviderPreset {
  readonly id: string
  readonly name: string
  readonly format: LLMApiFormat
  /** Default base URL. Empty for the custom provider. */
  readonly baseUrl: string
  /** Where to create an API key. Undefined for providers that need none. */
  readonly keyUrl?: string
  /** Local providers need no key and get a longer timeout. */
  readonly local?: boolean
  /** Whether the user can (and for custom, must) edit the base URL. */
  readonly editableBaseUrl?: boolean
}

export const CustomProviderId = 'custom'

export const AIProviderPresets: ReadonlyArray<IAIProviderPreset> = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    format: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    format: 'openai',
    baseUrl: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    format: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'zhipu',
    name: 'Zhipu (GLM)',
    format: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'dashscope',
    name: 'Alibaba Bailian (Qwen)',
    format: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://bailian.console.aliyun.com/',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    format: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    format: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    local: true,
    editableBaseUrl: true,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (local)',
    format: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    local: true,
    editableBaseUrl: true,
  },
  {
    id: CustomProviderId,
    name: 'Custom (OpenAI-compatible)',
    format: 'openai',
    baseUrl: '',
    editableBaseUrl: true,
  },
]

/** The user's AI configuration. The API key lives in the OS keychain. */
export interface IAISettings {
  readonly providerId: string
  readonly model: string
  /** Overrides the preset's base URL (local and custom providers only). */
  readonly baseUrl?: string
}

const SettingsKey = 'ai-settings'
const KeychainService = `${
  __DEV__ ? `${__APP_NAME__} Dev` : __APP_NAME__
} - AI provider`

const CloudTimeoutMs = 60 * 1000
const LocalTimeoutMs = 3 * 60 * 1000

export function getAIProviderPreset(id: string): IAIProviderPreset | undefined {
  return AIProviderPresets.find(p => p.id === id)
}

/** The base URL to use for the given settings. */
export function getEffectiveBaseUrl(
  preset: IAIProviderPreset,
  baseUrl: string | undefined
): string {
  return preset.editableBaseUrl && baseUrl ? baseUrl.trim() : preset.baseUrl
}

export function loadAISettings(): IAISettings | null {
  const raw = localStorage.getItem(SettingsKey)
  if (raw === null) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'providerId' in parsed &&
      'model' in parsed &&
      typeof parsed.providerId === 'string' &&
      typeof parsed.model === 'string'
    ) {
      const baseUrl =
        'baseUrl' in parsed && typeof parsed.baseUrl === 'string'
          ? parsed.baseUrl
          : undefined
      return { providerId: parsed.providerId, model: parsed.model, baseUrl }
    }
  } catch {
    // Fall through and treat corrupt settings as unset.
  }

  return null
}

export function saveAISettings(settings: IAISettings | null) {
  if (settings === null) {
    localStorage.removeItem(SettingsKey)
  } else {
    localStorage.setItem(SettingsKey, JSON.stringify(settings))
  }
}

/** Reads the API key stored for the given provider, if any. */
export function getAIProviderKey(providerId: string): Promise<string | null> {
  return TokenStore.getItem(KeychainService, providerId)
}

/** Stores (or, for an empty key, removes) the provider's API key. */
export async function setAIProviderKey(
  providerId: string,
  key: string
): Promise<void> {
  if (key.length === 0) {
    await TokenStore.deleteItem(KeychainService, providerId)
  } else {
    await TokenStore.setItem(KeychainService, providerId, key)
  }
}

/**
 * Returns true if the given URL points at the local machine: `localhost`,
 * IPv6 loopback or anything in 127.0.0.0/8.
 */
export function isLocalUrl(url: string): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }

  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    (isIPv4(hostname) && hostname.startsWith('127.'))
  )
}

/**
 * Base URLs must be https, except on the local machine: sending an API key
 * over plain http to a remote host would leak it to anyone on the path.
 */
export function isValidBaseUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || (protocol === 'http:' && isLocalUrl(url))
  } catch {
    return false
  }
}

/** Builds the connection details for the given provider and key. */
export function getAIConnection(
  preset: IAIProviderPreset,
  baseUrl: string | undefined,
  apiKey: string | null
): ILLMConnection {
  return {
    format: preset.format,
    baseUrl: getEffectiveBaseUrl(preset, baseUrl),
    ...(apiKey ? { apiKey } : {}),
  }
}

export function getAITimeoutMs(preset: IAIProviderPreset, baseUrl: string) {
  return preset.local || isLocalUrl(baseUrl) ? LocalTimeoutMs : CloudTimeoutMs
}
