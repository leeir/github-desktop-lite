import { net } from 'electron'
import * as ipcMain from './ipc-main'
import {
  buildCompletionRequest,
  buildListModelsRequest,
  extractCompletionText,
  extractErrorMessage,
  extractModelIds,
  ILLMHttpRequest,
  ILLMRequest,
  LLMModelsResult,
  LLMResult,
} from '../lib/ai/llm-request'

const ListModelsTimeoutMs = 15000

/** In-flight completions keyed by the renderer-supplied request id. */
const inFlight = new Map<string, AbortController>()

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text.length > 0 ? { message: text.slice(0, 500) } : null
  }
}

/**
 * Performs the request through Chromium's network stack (so the system proxy
 * applies, like for the rest of the app) and returns the parsed body, or an
 * error message.
 */
async function send(
  http: ILLMHttpRequest,
  signal: AbortSignal
): Promise<{ ok: true; json: unknown } | { ok: false; message: string }> {
  const response = await net.fetch(http.url, {
    method: http.method,
    headers: http.headers,
    body: http.body,
    signal,
  })
  const json = await readJson(response)

  if (!response.ok) {
    const detail = extractErrorMessage(json) ?? response.statusText
    return {
      ok: false,
      message: `The model provider returned ${response.status}: ${detail}`,
    }
  }

  return { ok: true, json }
}

function describeNetworkError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e)
  return `Could not reach the model provider: ${message}`
}

async function complete(request: ILLMRequest): Promise<LLMResult> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, request.timeoutMs)

  inFlight.get(request.id)?.abort()
  inFlight.set(request.id, controller)

  try {
    const result = await send(
      buildCompletionRequest(request),
      controller.signal
    )
    if (!result.ok) {
      return { kind: 'error', message: result.message }
    }

    const text = extractCompletionText(request.connection.format, result.json)
    if (text === null || text.trim().length === 0) {
      return {
        kind: 'error',
        message: 'The model provider returned an empty response.',
      }
    }

    return { kind: 'ok', text }
  } catch (e) {
    if (controller.signal.aborted) {
      return timedOut
        ? {
            kind: 'error',
            message: `The model provider did not respond within ${Math.round(
              request.timeoutMs / 1000
            )} seconds.`,
          }
        : { kind: 'cancelled' }
    }

    return { kind: 'error', message: describeNetworkError(e) }
  } finally {
    clearTimeout(timeout)
    if (inFlight.get(request.id) === controller) {
      inFlight.delete(request.id)
    }
  }
}

async function listModels(
  connection: ILLMRequest['connection']
): Promise<LLMModelsResult> {
  try {
    const result = await send(
      buildListModelsRequest(connection),
      AbortSignal.timeout(ListModelsTimeoutMs)
    )
    if (!result.ok) {
      return { kind: 'error', message: result.message }
    }

    const models = extractModelIds(result.json)
    return models === null
      ? { kind: 'error', message: 'The provider did not return a model list.' }
      : { kind: 'ok', models }
  } catch (e) {
    return { kind: 'error', message: describeNetworkError(e) }
  }
}

/** Registers the IPC handlers used to talk to the user's model provider. */
export function registerAIClientHandlers() {
  ipcMain.handle('ai-complete', (_, request) => complete(request))
  ipcMain.handle('ai-list-models', (_, connection) => listModels(connection))
  ipcMain.on('ai-cancel', (_, id) => inFlight.get(id)?.abort())
}
