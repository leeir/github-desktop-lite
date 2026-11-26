import * as React from 'react'
import { Branch } from '../../models/branch'
import { BranchSelect } from '../branches/branch-select'
import { DialogHeader } from '../dialog/header'
import { Ref } from '../lib/ref'
import { Repository } from '../../models/repository'
import { IChangesetData } from '../../lib/git'

export const OpenPullRequestDialogId = 'Dialog_Open_Pull_Request'

interface IOpenPullRequestDialogHeaderProps {
  readonly repository: Repository

  /** The base branch of the pull request */
  readonly baseBranch: Branch | null

  /** The branch of the pull request */
  readonly currentBranch: Branch

  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /** Local and fetched remote branches available for comparison. */
  readonly prBaseBranches: ReadonlyArray<Branch>

  /** Recently used branches available for comparison. */
  readonly prRecentBaseBranches: ReadonlyArray<Branch>

  /** The count of commits of the pull request */
  readonly commitCount: number

  /** The changeset data associated with the selected commit */
  readonly changesetData: IChangesetData

  /** When the branch selection changes */
  readonly onBranchChange: (branch: Branch) => void

  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the dismissable prop.
   */
  readonly onDismissed?: () => void
}

/**
 * A header component for the open pull request dialog. Made to house the
 * base branch dropdown and merge details common to all pull request views.
 */
export class OpenPullRequestDialogHeader extends React.Component<IOpenPullRequestDialogHeaderProps> {
  public constructor(props: IOpenPullRequestDialogHeaderProps) {
    super(props)
  }

  public render() {
    const title = 'Compare branches'
    const {
      baseBranch,
      currentBranch,
      changesetData,
      defaultBranch,
      prBaseBranches,
      prRecentBaseBranches,
      commitCount,
      onBranchChange,
      onDismissed,
    } = this.props
    const { linesAdded, linesDeleted, files } = changesetData
    const commits = `${commitCount} commit${commitCount === 1 ? '' : 's'}`
    const fileCount = files.length

    return (
      <DialogHeader
        title={title}
        titleId={OpenPullRequestDialogId}
        onCloseButtonClick={onDismissed}
      >
        <div className="compare-header-meta">
          <div className="base-branch-details">
            <span className="compare-commit-badge">{commits}</span>
            <span>comparing</span>
            <Ref>{currentBranch.name}</Ref>
            <span>against</span>
            <BranchSelect
              repository={this.props.repository}
              branch={baseBranch}
              defaultBranch={defaultBranch}
              currentBranch={currentBranch}
              allBranches={prBaseBranches}
              recentBranches={prRecentBaseBranches}
              onChange={onBranchChange}
              noBranchesMessage={
                <>
                  <p>No matching branch.</p>
                  <p>
                    Fetch to update remote branches, or choose a local branch.
                  </p>
                </>
              }
            />
          </div>
          <div className="lines-added-deleted">
            <span className="sr-only">
              {fileCount} {fileCount === 1 ? 'file' : 'files'}, {linesAdded}{' '}
              added lines, {linesDeleted} removed lines
            </span>
            {fileCount > 0 && (
              <span className="compare-files-count" aria-hidden="true">
                {fileCount} {fileCount === 1 ? 'file' : 'files'}
              </span>
            )}
            <span className="lines-added" aria-hidden="true">
              +{linesAdded.toLocaleString()}
            </span>
            <span className="lines-deleted" aria-hidden="true">
              -{linesDeleted.toLocaleString()}
            </span>
          </div>
        </div>
        <p className="comparison-explanation">
          Committed changes since the shared ancestor. Remote branches reflect
          your last fetch; uncommitted changes remain in Review changes.
        </p>
      </DialogHeader>
    )
  }
}
