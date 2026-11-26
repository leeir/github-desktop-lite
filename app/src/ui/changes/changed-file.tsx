import * as React from 'react'

import * as Path from 'path'
import { Octicon, fileCode } from '../octicons'
import { HighlightText } from '../lib/highlight-text'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { mapStatus, mapStatusLetter } from '../../lib/status'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../models/status'
import { TooltipDirection } from '../lib/tooltip'
import { TooltippedContent } from '../lib/tooltipped-content'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { IMatches } from '../../lib/fuzzy-find'

interface IChangedFileProps {
  readonly file: WorkingDirectoryFileChange
  readonly include: boolean | null
  readonly availableWidth: number
  readonly disableSelection: boolean
  readonly checkboxTooltip?: string
  readonly focused: boolean
  /** The characters in the file path to highlight */
  readonly matches?: IMatches
  readonly onIncludeChanged: (
    file: WorkingDirectoryFileChange,
    include: boolean
  ) => void
}

/** a changed file in the working directory for a given repository */
export class ChangedFile extends React.Component<IChangedFileProps, {}> {
  private handleCheckboxChange = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onIncludeChanged(this.props.file, include)
  }

  private get checkboxValue(): CheckboxValue {
    if (this.props.include === true) {
      return CheckboxValue.On
    } else if (this.props.include === false) {
      return CheckboxValue.Off
    } else {
      return CheckboxValue.Mixed
    }
  }

  public render() {
    const { file, disableSelection, checkboxTooltip, focused, matches } =
      this.props
    const { status, path } = file
    const fileStatus = mapStatus(status)

    const name = Path.basename(path)
    const directory = Path.dirname(path)
    const offset = path.length - name.length
    const oldPath =
      status.kind === AppFileStatusKind.Renamed ||
      status.kind === AppFileStatusKind.Copied
        ? status.oldPath
        : null

    const includedText =
      this.props.include === true
        ? 'included'
        : this.props.include === null
        ? 'partially included'
        : 'not included'

    const pathScreenReaderMessage = `${path} ${mapStatus(
      status
    )} ${includedText}`

    return (
      <div className="file" style={{ maxWidth: this.props.availableWidth }}>
        <TooltippedContent
          tooltip={checkboxTooltip}
          direction={TooltipDirection.EAST}
          tagName="div"
        >
          <Checkbox
            // The checkbox doesn't need to be tab reachable since we emulate
            // checkbox behavior on the list item itself, ie hitting space bar
            // while focused on a row will toggle selection.
            tabIndex={-1}
            value={this.checkboxValue}
            onChange={this.handleCheckboxChange}
            disabled={disableSelection}
          />
        </TooltippedContent>

        <Octicon symbol={fileCode} className="changed-file-icon" />
        <TooltippedContent
          className="changed-file-path"
          tooltip={oldPath === null ? path : `${oldPath} → ${path}`}
          direction={TooltipDirection.EAST}
        >
          <span className="changed-file-name" aria-hidden="true">
            <HighlightText
              text={name}
              highlight={
                matches?.title.filter(i => i >= offset).map(i => i - offset) ??
                []
              }
            />
          </span>
          <span className="changed-file-directory" aria-hidden="true">
            {oldPath !== null ? (
              `From ${oldPath}`
            ) : directory === '.' ? (
              'Repository root'
            ) : (
              <HighlightText
                text={directory}
                highlight={
                  matches?.title.filter(i => i < directory.length) ?? []
                }
              />
            )}
          </span>
        </TooltippedContent>

        <AriaLiveContainer message={pathScreenReaderMessage} />
        <TooltippedContent
          ancestorFocused={focused}
          openOnFocus={true}
          tooltip={fileStatus}
          direction={TooltipDirection.EAST}
        >
          <span
            className={'file-status-letter status-' + fileStatus.toLowerCase()}
            aria-hidden="true"
          >
            {mapStatusLetter(fileStatus)}
          </span>
        </TooltippedContent>
      </div>
    )
  }
}
