import * as React from 'react'
import { Button } from '../lib/button'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IChangesEmptyStateProps {
  readonly branch: string | null
  readonly onViewHistory: () => void
}

/**
 * Clean working-tree empty state shown inside the Changes sidebar when there
 * are no modified files and no active amend / empty-commit / rebase flow.
 */
export class ChangesEmptyState extends React.Component<
  IChangesEmptyStateProps,
  {}
> {
  public render() {
    const { branch, onViewHistory } = this.props

    return (
      <div className="changes-empty-state" role="status" aria-live="polite">
        <div className="changes-empty-emblem" aria-hidden="true">
          <div className="ghost-card ghost-left">
            <span className="ghost-line ghost-line-a" />
            <span className="ghost-line ghost-line-b" />
            <span className="ghost-line ghost-line-c" />
          </div>
          <div className="ghost-card ghost-right">
            <span className="ghost-line ghost-line-a" />
            <span className="ghost-line ghost-line-b" />
            <span className="ghost-line ghost-line-c" />
          </div>
          <span className="tile-halo" />
          <div className="front-tile">
            <svg
              className="check-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path className="check-path" d="M5.5 12.5L10 17L18.5 7.5" />
            </svg>
          </div>
        </div>

        <div className="changes-empty-title">No local changes</div>
        <p className="changes-empty-subtitle">
          Working tree is clean. Edits show up here automatically.
        </p>

        <div className="changes-empty-status">
          <span className="live-dot" aria-hidden="true" />
          {branch !== null ? (
            <>
              <span>Watching</span>
              <span className="status-sep" aria-hidden="true">
                ·
              </span>
              <TooltippedContent
                className="branch-name"
                tooltip={branch}
                onlyWhenOverflowed={true}
              >
                {branch}
              </TooltippedContent>
            </>
          ) : (
            <span>Watching working tree</span>
          )}
        </div>

        <Button
          className="changes-empty-history-button"
          onClick={onViewHistory}
        >
          <span>View commit history</span>
          <Octicon symbol={octicons.arrowRight} />
        </Button>
      </div>
    )
  }
}
