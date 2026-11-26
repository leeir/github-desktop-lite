import { Repository } from '../../models/repository'
import { IBulkPullOutcome } from '../../models/bulk-pull'
import { git } from './core'
import { getStatus, IStatusResult } from './status'
import { getConfigValue } from './config'
import { getRemotes } from './remote'
import { getAheadBehind } from './rev-list'
import { envForRemoteOperation } from './environment'

function reasonToSkip(status: IStatusResult | null): string | null {
  if (status === null) {
    return 'Repository is unavailable.'
  }
  if (status.currentBranch === undefined || status.currentTip === undefined) {
    return 'No committed branch is checked out.'
  }
  if (
    status.mergeHeadFound ||
    status.squashMsgFound ||
    status.rebaseInternalState !== null ||
    status.isCherryPickingHeadFound
  ) {
    return 'A merge, rebase, or cherry-pick is in progress.'
  }
  if (status.workingDirectory.files.length > 0) {
    return 'Uncommitted changes; commit or stash them first.'
  }
  return null
}

/** Update only the checked-out branch, without stashing, rebasing, or merging divergent history. */
export async function pullCurrentBranch(
  repository: Repository
): Promise<IBulkPullOutcome> {
  let status = await getStatus(repository)
  const branch = status?.currentBranch ?? null
  const outcome = (
    result: IBulkPullOutcome['status'],
    message: string
  ): IBulkPullOutcome => ({ status: result, branch, message })

  const skipReason = reasonToSkip(status)
  if (skipReason !== null || status === null) {
    return outcome('skipped', skipReason ?? 'Repository is unavailable.')
  }

  const originalTip = status.currentTip
  const [remoteName, mergeRef] = await Promise.all([
    getConfigValue(repository, `branch.${branch}.remote`),
    getConfigValue(repository, `branch.${branch}.merge`),
  ])
  if (remoteName === null || mergeRef === null) {
    return outcome('skipped', 'Current branch has no upstream branch.')
  }

  const remote = (await getRemotes(repository)).find(r => r.name === remoteName)
  if (remote === undefined && remoteName !== '.') {
    return outcome('skipped', 'The upstream remote is unavailable.')
  }

  const env = await envForRemoteOperation(remote?.url ?? repository.path)
  // Fetch only this branch. Never fast-forward other local branches as a side effect.
  // Bound network waits so an unavailable remote cannot stall the entire batch.
  await git(
    [
      'fetch',
      '--no-recurse-submodules',
      '--no-tags',
      '--',
      remoteName,
      mergeRef,
    ],
    repository.path,
    'bulkPullFetch',
    { env, signal: AbortSignal.timeout(120_000) }
  )
  const { stdout } = await git(
    ['rev-parse', '--verify', 'FETCH_HEAD^{commit}'],
    repository.path,
    'bulkPullTarget'
  )
  const target = stdout.trim()

  // The user can edit files or switch branches while the network request runs.
  status = await getStatus(repository)
  const updatedSkipReason = reasonToSkip(status)
  if (updatedSkipReason !== null) {
    return outcome('skipped', updatedSkipReason)
  }
  if (status?.currentBranch !== branch || status.currentTip !== originalTip) {
    return outcome(
      'skipped',
      'Current branch changed while fetching; try again.'
    )
  }

  const aheadBehind = await getAheadBehind(
    repository,
    `${originalTip}...${target}`
  )
  if (aheadBehind === null) {
    return outcome('skipped', 'Could not compare the branch with its upstream.')
  }
  if (aheadBehind.behind === 0) {
    return outcome(
      'up-to-date',
      aheadBehind.ahead > 0
        ? `No incoming commits; ${aheadBehind.ahead} local commits ahead.`
        : 'Already up to date.'
    )
  }
  if (aheadBehind.ahead > 0) {
    return outcome(
      'skipped',
      'Branch has diverged; pull this repository individually.'
    )
  }

  // Merge the fetched commit even if its remote-tracking ref changes afterwards.
  // Git also refuses to overwrite any conflicting edits made since our check.
  await git(
    [
      '-c',
      'submodule.recurse=false',
      'merge',
      '--ff-only',
      '--no-edit',
      '--no-autostash',
      '--no-overwrite-ignore',
      '--',
      target,
    ],
    repository.path,
    'bulkPullFastForward',
    { env }
  )

  return outcome('updated', `Pulled ${aheadBehind.behind} incoming commits.`)
}
