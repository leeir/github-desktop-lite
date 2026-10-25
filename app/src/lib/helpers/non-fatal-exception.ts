export type ExceptionKinds =
  | 'invalidListSelection'
  | 'TooManyPopups'
  | 'remoteNameMismatch'
  | 'multiCommitOperation'
  | 'PullRequestState'
  | 'trampolineCommandParser'
  | 'trampolineServer'
  | 'PopupNoId'
  | 'FailedToStartPullRequest'
  | 'unhandledRejection'
  | 'rebaseConflictsWithBranchAlreadyUpToDate'
  | 'forkCreation'
  | 'NoSuggestedActionsProvided'
  | 'NoSuggestedActionsProvided'
  | 'resizeObserverLoopCompleted'

/**
 * Lite reports nothing to GitHub; unexpected-but-handled errors only go to
 * the local log.
 */
export function sendNonFatalException(kind: ExceptionKinds, error: Error) {
  log.error(`Non-fatal exception (${kind})`, error)
}
