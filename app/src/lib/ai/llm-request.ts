/**
 * Wire-level helpers for talking to the user's model provider. Everything in
 * here is pure and serializable so it can be shared between the renderer
 * (which builds the request) and the main process (which performs the HTTP
 * call).
 */

/** The two wire formats we speak. Nearly every provider is OpenAI-compatible. */
export type LLMApiFormat = 'openai' | 'anthropic'

/** Serializable connection details sent from the renderer over IPC. */
export interface ILLMConnection {
  readonly format: LLMApiFormat
  readonly baseUrl: string
  readonly apiKey?: string
}

/** A single chat completion request. */
export interface ILLMRequest {
  /** Caller-chosen identifier used to cancel an in-flight request. */
  readonly id: string
  readonly connection: ILLMConnection
  readonly model: string
  readonly systemPrompt: string
  readonly userPrompt: string
  readonly timeoutMs: number
}

/** Outcome of an {@link ILLMRequest}, returned instead of throwing over IPC. */
export type LLMResult =
  | { readonly kind: 'ok'; readonly text: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'error'; readonly message: string }

/** Outcome of listing a provider's models. */
export type LLMModelsResult =
  | { readonly kind: 'ok'; readonly models: ReadonlyArray<string> }
  | { readonly kind: 'error'; readonly message: string }

/** An HTTP request ready to be handed to `fetch`. */
export interface ILLMHttpRequest {
  readonly url: string
  readonly method: 'GET' | 'POST'
  readonly headers: Record<string, string>
  readonly body?: string
}

const AnthropicVersion = '2023-06-01'
const MaxOutputTokens = 2048

function trimTrailingSlashes(url: string) {
  return url.replace(/\/+$/, '')
}

/** Anthropic's paths include the version; tolerate base URLs that already do. */
function anthropicUrl(baseUrl: string, path: string) {
  const base = trimTrailingSlashes(baseUrl)
  return base.endsWith('/v1') ? `${base}/${path}` : `${base}/v1/${path}`
}

function getHeaders(connection: ILLMConnection): Record<string, string> {
  const { apiKey } = connection

  if (connection.format === 'anthropic') {
    return {
      'anthropic-version': AnthropicVersion,
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    }
  }

  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

/** Builds the chat completion HTTP request for the connection's format. */
export function buildCompletionRequest(request: ILLMRequest): ILLMHttpRequest {
  const { connection } = request
  const headers = {
    'content-type': 'application/json',
    ...getHeaders(connection),
  }

  if (connection.format === 'anthropic') {
    return {
      url: anthropicUrl(connection.baseUrl, 'messages'),
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model,
        max_tokens: MaxOutputTokens,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
      }),
    }
  }

  return {
    url: `${trimTrailingSlashes(connection.baseUrl)}/chat/completions`,
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    }),
  }
}

/** Builds the HTTP request that lists the provider's models. */
export function buildListModelsRequest(
  connection: ILLMConnection
): ILLMHttpRequest {
  return {
    url:
      connection.format === 'anthropic'
        ? anthropicUrl(connection.baseUrl, 'models?limit=1000')
        : `${trimTrailingSlashes(connection.baseUrl)}/models`,
    method: 'GET',
    headers: getHeaders(connection),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Joins the `text` of every `text` content part. */
function joinTextParts(parts: unknown): string | null {
  if (!Array.isArray(parts)) {
    return null
  }

  const texts = parts
    .filter(
      (p): p is { type: string; text: string } =>
        isRecord(p) && p.type === 'text' && typeof p.text === 'string'
    )
    .map(p => p.text)

  return texts.length > 0 ? texts.join('') : null
}

/**
 * Extracts the assistant text from a successful completion response body.
 * Returns null when the body doesn't have the expected shape.
 */
export function extractCompletionText(
  format: LLMApiFormat,
  body: unknown
): string | null {
  if (!isRecord(body)) {
    return null
  }

  if (format === 'anthropic') {
    return joinTextParts(body.content)
  }

  const choices = body.choices
  if (!Array.isArray(choices) || !isRecord(choices[0])) {
    return null
  }

  const message = choices[0].message
  if (!isRecord(message)) {
    return null
  }

  return typeof message.content === 'string'
    ? message.content
    : joinTextParts(message.content)
}

/**
 * Extracts model ids from a `/models` response. Both OpenAI-compatible
 * providers and Anthropic return `{ data: [{ id }] }`; Ollama's native API
 * returns `{ models: [{ name }] }`. Sorted and deduplicated.
 */
export function extractModelIds(body: unknown): ReadonlyArray<string> | null {
  if (!isRecord(body)) {
    return null
  }

  const list = Array.isArray(body.data)
    ? body.data
    : Array.isArray(body.models)
    ? body.models
    : null

  if (list === null) {
    return null
  }

  const ids = list
    .map(m =>
      isRecord(m)
        ? typeof m.id === 'string'
          ? m.id
          : typeof m.name === 'string'
          ? m.name
          : null
        : null
    )
    .filter((id): id is string => id !== null && id.length > 0)

  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

/**
 * Extracts a human-readable error message from a failed provider response
 * body. Providers disagree on the shape, so try the common ones.
 */
export function extractErrorMessage(body: unknown): string | null {
  if (!isRecord(body)) {
    return null
  }

  const error = body.error
  if (typeof error === 'string') {
    return error
  }

  if (isRecord(error) && typeof error.message === 'string') {
    return error.message
  }

  if (typeof body.message === 'string') {
    return body.message
  }

  return null
}
