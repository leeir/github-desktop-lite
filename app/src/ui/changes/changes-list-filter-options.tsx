import * as React from 'react'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import {
  countActiveFilterOptions,
  hasActiveFilters,
} from './filter-changes-logic'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { IFileListFilterState } from '../../lib/app-state'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import memoizeOne from 'memoize-one'
import { Button } from '../lib/button'
import classNames from 'classnames'
import { WorkingDirectoryStatus } from '../../models/status'

interface IChangesListFilterOptionsProps {
  readonly fileListFilter: IFileListFilterState
  readonly workingDirectory: WorkingDirectoryStatus
  readonly onFilterToIncludedInCommit: () => void
  readonly onFilterExcludedFiles: () => void
  readonly onFilterDeletedFiles: () => void
  readonly onFilterModifiedFiles: () => void
  readonly onFilterNewFiles: () => void
  readonly onClearAllFilters: () => void
}

interface IChangesListFilterOptionsState {
  readonly isFilterOptionsOpen: boolean
}

/**
 * Component to render filter options for the changes list.
 *
 * Allows users to filter files based on their status (new, modified, deleted, etc.)
 * and includes a button to clear all filters.
 */
export class ChangesListFilterOptions extends React.Component<
  IChangesListFilterOptionsProps,
  IChangesListFilterOptionsState
> {
  private getFilterCounts = memoizeOne((wd: WorkingDirectoryStatus) => {
    const counts = {
      newFilesCount: 0,
      modifiedFilesCount: 0,
      deletedFilesCount: 0,
      includedFilesCount: 0,
      excludedFilesCount: 0,
    }

    // Keep counts stable while combining filters; hidden types remain selectable.
    wd.files.forEach(file => {
      if (file.isNew() || file.isUntracked()) {
        counts.newFilesCount++
      }
      if (file.isModified()) {
        counts.modifiedFilesCount++
      }
      if (file.isDeleted()) {
        counts.deletedFilesCount++
      }
      if (file.isIncludedInCommit()) {
        counts.includedFilesCount++
      }
      if (file.isExcludedFromCommit()) {
        counts.excludedFilesCount++
      }
    })

    return counts
  })

  private filterOptionsButtonRef: HTMLButtonElement | null = null

  public constructor(props: IChangesListFilterOptionsProps) {
    super(props)

    this.state = {
      isFilterOptionsOpen: false,
    }
  }

  private closeFilterOptions = () => {
    this.setState({ isFilterOptionsOpen: false })
  }

  private onFilterToIncludedInCommit = () => {
    this.props.onFilterToIncludedInCommit()
  }

  private onFilterExcludedFiles = () => {
    this.props.onFilterExcludedFiles()
  }

  private onFilterDeletedFiles = () => {
    this.props.onFilterDeletedFiles()
  }

  private onFilterModifiedFiles = () => {
    this.props.onFilterModifiedFiles()
  }

  private onFilterNewFiles = () => {
    this.props.onFilterNewFiles()
  }

  private onClearAllFilters = () => {
    this.props.onClearAllFilters()
    this.closeFilterOptions()
  }

  // Opens the filter options popover, or closes it if it's already open.
  private toggleFilterOptionsOpen = () => {
    this.setState(prevState => ({
      isFilterOptionsOpen: !prevState.isFilterOptionsOpen,
    }))
  }

  private renderFilterOptions() {
    // Check if any filters are active
    const filtersActive = hasActiveFilters(this.props.fileListFilter)

    const {
      newFilesCount,
      modifiedFilesCount,
      deletedFilesCount,
      excludedFilesCount,
      includedFilesCount,
    } = this.getFilterCounts(this.props.workingDirectory)

    return (
      <Popover
        className="filter-popover"
        ariaLabelledby="filter-options-header"
        anchor={this.filterOptionsButtonRef}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        anchorOffset={6}
        decoration={PopoverDecoration.Bordered}
        onMousedownOutside={this.closeFilterOptions}
        onClickOutside={this.closeFilterOptions}
      >
        <div className="filter-popover-header">
          <h3 id="filter-options-header">Filter changes</h3>
          <button
            className="close"
            onClick={this.closeFilterOptions}
            aria-label="Close"
          >
            <Octicon symbol={octicons.x} />
          </button>
        </div>
        <div className="filter-options">
          <div
            className="filter-option-group"
            role="group"
            aria-label="Commit selection"
          >
            <div className="filter-group-label" aria-hidden="true">
              Commit selection
            </div>
            <Checkbox
              value={
                this.props.fileListFilter.isIncludedInCommit
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onFilterToIncludedInCommit}
              label={
                <>
                  <Octicon
                    symbol={octicons.check}
                    className="filter-option-check"
                  />
                  <span className="filter-option-label">
                    Included in commit
                  </span>{' '}
                  <span className="filter-option-count">
                    {includedFilesCount}
                  </span>
                </>
              }
            />
            <Checkbox
              value={
                this.props.fileListFilter.isExcludedFromCommit
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onFilterExcludedFiles}
              label={
                <>
                  <Octicon
                    symbol={octicons.check}
                    className="filter-option-check"
                  />
                  <span className="filter-option-label">
                    Excluded from commit
                  </span>{' '}
                  <span className="filter-option-count">
                    {excludedFilesCount}
                  </span>
                </>
              }
            />
          </div>
          <div
            className="filter-option-group"
            role="group"
            aria-label="File type"
          >
            <div className="filter-group-label" aria-hidden="true">
              File type
            </div>
            <Checkbox
              value={
                this.props.fileListFilter.isNewFile
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onFilterNewFiles}
              label={
                <>
                  <Octicon
                    symbol={octicons.check}
                    className="filter-option-check"
                  />
                  <span className="filter-option-label">New files</span>{' '}
                  <span className="filter-option-count">{newFilesCount}</span>
                </>
              }
            />
            <Checkbox
              value={
                this.props.fileListFilter.isModifiedFile
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onFilterModifiedFiles}
              label={
                <>
                  <Octicon
                    symbol={octicons.check}
                    className="filter-option-check"
                  />
                  <span className="filter-option-label">Modified files</span>{' '}
                  <span className="filter-option-count">
                    {modifiedFilesCount}
                  </span>
                </>
              }
            />
            <Checkbox
              value={
                this.props.fileListFilter.isDeletedFile
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onFilterDeletedFiles}
              label={
                <>
                  <Octicon
                    symbol={octicons.check}
                    className="filter-option-check"
                  />
                  <span className="filter-option-label">Deleted files</span>{' '}
                  <span className="filter-option-count">
                    {deletedFilesCount}
                  </span>
                </>
              }
            />
          </div>
        </div>
        {filtersActive && (
          <div className="filter-options-footer">
            <Button onClick={this.onClearAllFilters}>Clear filters</Button>
          </div>
        )}
      </Popover>
    )
  }

  private onFilterOptionsButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.filterOptionsButtonRef = buttonRef
  }

  public render() {
    const activeFiltersCount = countActiveFilterOptions(
      this.props.fileListFilter
    )
    const hasActiveFilters = activeFiltersCount > 0
    const buttonTextLabel = `Filter Options ${
      hasActiveFilters ? `(${activeFiltersCount} applied)` : ''
    }`

    return (
      <>
        <Button
          className={classNames('filter-button', {
            active: hasActiveFilters,
          })}
          onClick={this.toggleFilterOptionsOpen}
          ariaExpanded={this.state.isFilterOptionsOpen}
          onButtonRef={this.onFilterOptionsButtonRef}
          tooltip={this.state.isFilterOptionsOpen ? undefined : buttonTextLabel}
          ariaLabel={buttonTextLabel}
        >
          <span>
            <Octicon symbol={octicons.filter} />
          </span>
          {hasActiveFilters ? (
            <span className="filter-active-count" aria-hidden="true">
              {activeFiltersCount}
            </span>
          ) : null}
          <Octicon symbol={octicons.triangleDown} />
        </Button>
        {this.state.isFilterOptionsOpen && this.renderFilterOptions()}
      </>
    )
  }
}
