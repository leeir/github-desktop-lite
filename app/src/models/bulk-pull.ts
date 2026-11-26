import { Repository } from './repository'

export interface IBulkPullOutcome {
  readonly status: 'updated' | 'up-to-date' | 'skipped' | 'failed'
  readonly branch: string | null
  readonly message: string
}

export interface IBulkPullResult extends IBulkPullOutcome {
  readonly repository: Repository
}

/** A batch continues even when the repository list is closed or filtered. */
export interface IBulkPullState {
  readonly running: boolean
  readonly total: number
  readonly currentRepository: Repository | null
  readonly results: ReadonlyArray<IBulkPullResult>
}
