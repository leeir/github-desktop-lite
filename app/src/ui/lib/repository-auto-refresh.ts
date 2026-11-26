import * as Fs from 'fs'

const DefaultDebounceMs = 600
const DefaultCooldownMs = 1500
const FallbackPollIntervalMs = 5000

const IgnoredGitFullRefreshEntries = new Set([
  'HEAD',
  'MERGE_HEAD',
  'REBASE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'packed-refs',
])

export type WatchRefreshKind = 'working-tree' | 'full'

/**
 * Classify a filesystem event path into whether it should be ignored,
 * trigger a lightweight working-tree status refresh, or a full repository refresh.
 */
export function classifyWatchPath(
  filename: string | null
): 'ignore' | WatchRefreshKind {
  if (filename === null || filename.length === 0) {
    return 'full'
  }

  const normalized = filename.replace(/\\/g, '/').replace(/^\.\//, '')
  if (normalized.length === 0) {
    return 'full'
  }

  const segments = normalized.split('/')
  if (
    segments.includes('node_modules') ||
    segments.includes('.Trash') ||
    segments[segments.length - 1] === '.DS_Store' ||
    normalized.endsWith('.lock')
  ) {
    return 'ignore'
  }

  if (normalized === '.git') {
    return 'ignore'
  }

  if (normalized.startsWith('.git/')) {
    const gitSubpath = normalized.slice('.git/'.length)
    if (
      gitSubpath.startsWith('refs/') ||
      gitSubpath.startsWith('worktrees/') ||
      IgnoredGitFullRefreshEntries.has(gitSubpath)
    ) {
      return 'full'
    }
    return gitSubpath === 'index' ? 'working-tree' : 'ignore'
  }

  return 'working-tree'
}

/**
 * Determine whether a filesystem event path should be ignored by the
 * lightweight working-tree auto-refresh watcher.
 */
export function shouldIgnoreWatchPath(filename: string | null): boolean {
  return classifyWatchPath(filename) === 'ignore'
}

export interface IRepositoryAutoRefreshOptions {
  readonly debounceMs?: number
  readonly cooldownMs?: number
  readonly fallbackPollMs?: number
}

/**
 * Lightweight active-repository watcher that automatically refreshes
 * working-tree status when files change outside the app.
 */
export class RepositoryAutoRefresh {
  private readonly repoPath: string
  private readonly onRefresh: (kind: WatchRefreshKind) => Promise<void>
  private readonly debounceMs: number
  private readonly cooldownMs: number
  private readonly fallbackPollMs: number

  private watcher: Fs.FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private disposed = false
  private refreshing = false
  private queuedWhileRefreshing = false
  private pendingFullRefresh = false
  private lastRefreshFinishedAt = 0

  public constructor(
    repoPath: string,
    onRefresh: (kind: WatchRefreshKind) => Promise<void>,
    options: IRepositoryAutoRefreshOptions = {}
  ) {
    this.repoPath = repoPath
    this.onRefresh = onRefresh
    this.debounceMs = options.debounceMs ?? DefaultDebounceMs
    this.cooldownMs = options.cooldownMs ?? DefaultCooldownMs
    this.fallbackPollMs = options.fallbackPollMs ?? FallbackPollIntervalMs
    this.start()
  }

  private start() {
    if (process.platform === 'darwin' || process.platform === 'win32') {
      try {
        this.watcher = Fs.watch(
          this.repoPath,
          { recursive: true },
          (_eventType, filename) => {
            if (this.disposed) {
              return
            }
            const name =
              typeof filename === 'string'
                ? filename
                : filename
                ? String(filename)
                : null
            const kind = classifyWatchPath(name)
            if (kind === 'ignore') {
              return
            }
            if (kind === 'full') {
              this.pendingFullRefresh = true
            }
            this.scheduleRefresh()
          }
        )
        this.watcher.on('error', () => {
          this.stopWatcher()
          this.startFallbackPolling()
        })
        return
      } catch {
        this.stopWatcher()
      }
    }

    this.startFallbackPolling()
  }

  private startFallbackPolling() {
    if (this.disposed || this.pollTimer !== null) {
      return
    }
    this.pollTimer = setInterval(() => {
      if (this.disposed || document.hidden) {
        return
      }
      this.scheduleRefresh(0)
    }, this.fallbackPollMs)
  }

  private scheduleRefresh(delayMs = this.debounceMs) {
    if (this.disposed || document.hidden) {
      return
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
    }

    const elapsed = Date.now() - this.lastRefreshFinishedAt
    const waitMs = Math.max(delayMs, Math.max(0, this.cooldownMs - elapsed))

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.runRefresh()
    }, waitMs)
  }

  private async runRefresh() {
    if (this.disposed || document.hidden) {
      return
    }

    if (this.refreshing) {
      this.queuedWhileRefreshing = true
      return
    }

    const kind: WatchRefreshKind = this.pendingFullRefresh
      ? 'full'
      : 'working-tree'
    this.pendingFullRefresh = false

    this.refreshing = true
    try {
      await this.onRefresh(kind)
    } catch {
      // Errors during background refresh are non-fatal; focus/manual refresh can retry.
    } finally {
      this.lastRefreshFinishedAt = Date.now()
      this.refreshing = false
      if (this.queuedWhileRefreshing && !this.disposed) {
        this.queuedWhileRefreshing = false
        this.scheduleRefresh(this.debounceMs)
      }
    }
  }

  private stopWatcher() {
    if (this.watcher !== null) {
      try {
        this.watcher.close()
      } catch {
        // Ignore close errors on already-disposed watchers.
      }
      this.watcher = null
    }
  }

  public dispose() {
    this.disposed = true
    this.stopWatcher()
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
}
