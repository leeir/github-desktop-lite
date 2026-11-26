import { ITokens, IHighlightRequest } from './types'
import { encodePathAsUrl } from '../../lib/path'

const workerMaxRunDuration = 5 * 1000
/**
 * Each worker loads its own copy of the CodeMirror modes, so don't keep idle
 * ones around once the user has stopped looking at diffs.
 */
const workerMaxIdleDuration = 30 * 1000
const workerUri = encodePathAsUrl(__dirname, 'highlighter.js')

let activeWorker: Worker | null = null
let workerBusy = false
let idleTimeoutId: number | null = null
const waitQueue = new Array<() => void>()

async function acquireWorker(): Promise<Worker> {
  while (workerBusy) {
    await new Promise<void>(resolve => waitQueue.push(resolve))
  }

  if (idleTimeoutId !== null) {
    window.clearTimeout(idleTimeoutId)
    idleTimeoutId = null
  }

  if (activeWorker === null) {
    activeWorker = new Worker(workerUri)
  }

  workerBusy = true
  return activeWorker
}

function wakeNextWaiter() {
  const next = waitQueue.shift()
  if (next !== undefined) {
    next()
  }
}

function releaseWorker(worker: Worker) {
  worker.onmessage = null
  worker.onerror = null
  workerBusy = false

  if (waitQueue.length > 0) {
    wakeNextWaiter()
    return
  }

  idleTimeoutId = window.setTimeout(() => {
    idleTimeoutId = null
    if (!workerBusy && activeWorker === worker) {
      activeWorker.terminate()
      activeWorker = null
    }
  }, workerMaxIdleDuration)
}

function discardWorker(worker: Worker) {
  worker.onmessage = null
  worker.onerror = null
  worker.terminate()

  if (activeWorker === worker) {
    activeWorker = null
  }
  if (idleTimeoutId !== null) {
    window.clearTimeout(idleTimeoutId)
    idleTimeoutId = null
  }

  workerBusy = false
  wakeNextWaiter()
}

/**
 * Request an automatic detection of the language and highlight
 * the contents provided.
 *
 * @param contents  The actual contents which is to be used for
 *                  highlighting.
 * @param basename  The file basename of the path in question as returned
 *                  by node's basename() function (i.e. without a leading dot).
 * @param extension The file extension of the path in question as returned
 *                  by node's extname() function (i.e. with a leading dot).
 * @param tabSize   The width of a tab character. Defaults to 4. Used by the
 *                  stream to count columns. See CodeMirror's StringStream
 *                  class for more details.
 * @param lines     An optional filter of lines which needs to be tokenized.
 *
 *                  If undefined or empty all lines will be tokenized
 *                  and returned. By passing an explicit set of lines we can
 *                  both minimize the size of the response object (which needs
 *                  to be serialized over the IPC boundary) and, for stateless
 *                  modes we can significantly speed up the highlight process.
 */
export async function highlight(
  contentLines: ReadonlyArray<string>,
  basename: string,
  extension: string,
  tabSize: number,
  lines: Array<number>
): Promise<ITokens> {
  // Bail early if there's no content to highlight or if we don't
  // need any lines from this file.
  if (!contentLines.length || !lines.length) {
    return {}
  }

  // Serialize jobs on one warm worker so concurrent old/new diff requests
  // reuse its loaded CodeMirror mode instead of spawning & killing a second worker.
  const worker = await acquireWorker()

  return new Promise<ITokens>((resolve, reject) => {
    let timeout: null | number = null

    const clearTimeout = () => {
      if (timeout !== null) {
        window.clearTimeout(timeout)
        timeout = null
      }
    }

    worker.onerror = ev => {
      clearTimeout()
      discardWorker(worker)
      reject(ev.error || new Error(ev.message))
    }

    worker.onmessage = ev => {
      clearTimeout()
      releaseWorker(worker)
      resolve(ev.data as ITokens)
    }

    const request: IHighlightRequest = {
      contentLines,
      basename,
      extension,
      tabSize,
      lines,
      addModeClass: true,
    }

    worker.postMessage(request)

    timeout = window.setTimeout(() => {
      discardWorker(worker)
      reject(new Error('timed out'))
    }, workerMaxRunDuration)
  })
}
