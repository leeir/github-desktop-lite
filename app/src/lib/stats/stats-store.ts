/** Launch timings the main process reports to the renderer. */
export interface ILaunchStats {
  /** Time from main process start until the app `ready` event. */
  readonly mainReadyTime: number
  /** Time from when loading begins to loading end. */
  readonly loadTime: number
  /** Time from renderer start until the renderer `ready` event. */
  readonly rendererReadyTime: number
}

/** The part of the stats store that git stores and helpers depend on. */
export interface IStatsStore {
  increment: (key: string, n?: number) => Promise<void>
}

const done = (..._args: ReadonlyArray<unknown>) => Promise.resolve()

/**
 * Lite doesn't collect usage statistics: nothing is counted, stored or sent.
 * The store keeps the methods the rest of the app calls so those call sites
 * stay simple, but every one of them is a no-op.
 */
export class StatsStore implements IStatsStore {
  public recordTokenRefreshEvent = done
  public recordCommit = done
  public recordCommitUndone = done
  public recordAmendCommitSuccessful = done
  public addStashEntriesCreatedOutsideDesktop = done
  public recordMenuInitiatedMerge = done
  public recordRepoClicked = done
  public recordPush = done
  public recordWelcomeWizardInitiated = done
  public recordWelcomeWizardTerminated = done
  public recordAddExistingRepository = done
  public recordCloneRepository = done
  public recordCreateRepository = done
  public recordNonDefaultBranchCheckout = done
  public recordRepositoryCommitedInWithoutWriteAccess = done
  public recordOperationConflictsEncounteredCount = done
  public recordOperationSuccessful = done
  public recordOperationSuccessfulWithConflicts = done
  public recordOperationUndone = done
  public recordPullRequestReviewNotification = done
  public recordPullRequestReviewNotificationShown = done
  public recordPullRequestReviewNotificationClicked = done
  public recordPullRequestReviewDialogSwitchToPullRequest = done
  public recordWorktreeCount = done

  public increment(_key: string, _n?: number): Promise<void> {
    return done()
  }

  public setUsesShortLivedToken(_value: boolean): void {}

  public getOptOut(): boolean {
    return true
  }
}
