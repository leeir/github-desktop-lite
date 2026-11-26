import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Switch, SegmentedControl, ISegmentedOption } from '../lib/switch'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { Tooltip, TooltipDirection } from '../lib/tooltip'
import { createObservableRef } from '../lib/observable-ref'

interface IDiffOptionsProps {
  readonly isInteractiveDiff: boolean
  readonly hideWhitespaceChanges: boolean
  readonly onHideWhitespaceChangesChanged: (
    hideWhitespaceChanges: boolean
  ) => void

  readonly showSideBySideDiff: boolean
  readonly onShowSideBySideDiffChanged: (showSideBySideDiff: boolean) => void

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
}

type DiffLayout = 'unified' | 'split'

/** One column of lines, the way a unified diff reads. */
const UnifiedIcon = (
  <svg className="segment-icon" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="2.5" width="12" height="11" rx="2" />
    <path d="M4.75 6h6.5M4.75 8h4.5M4.75 10h6" />
  </svg>
)

/** Two columns side by side, the way a split diff reads. */
const SplitIcon = (
  <svg className="segment-icon" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="2.5" width="12" height="11" rx="2" />
    <path d="M8 2.5v11M4.25 6h2M4.25 8h1.5M9.75 6h2M9.75 8h1.5" />
  </svg>
)

const LayoutOptions: ReadonlyArray<ISegmentedOption<DiffLayout>> = [
  { value: 'unified', label: 'Unified', icon: UnifiedIcon },
  { value: 'split', label: 'Split', icon: SplitIcon },
]

interface IDiffOptionsState {
  readonly isPopoverOpen: boolean
}

export class DiffOptions extends React.Component<
  IDiffOptionsProps,
  IDiffOptionsState
> {
  private innerButtonRef = createObservableRef<HTMLButtonElement>()
  private diffOptionsRef = React.createRef<HTMLDivElement>()
  private gearIconRef = React.createRef<HTMLSpanElement>()

  public constructor(props: IDiffOptionsProps) {
    super(props)
    this.state = {
      isPopoverOpen: false,
    }
  }

  private onButtonClick = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (this.state.isPopoverOpen) {
      this.closePopover()
    } else {
      this.openPopover()
    }
  }

  private openPopover = () => {
    this.setState(prevState => {
      if (!prevState.isPopoverOpen) {
        this.props.onDiffOptionsOpened()
        return { isPopoverOpen: true }
      }
      return null
    })
  }

  private closePopover = () => {
    this.setState(prevState => {
      if (prevState.isPopoverOpen) {
        return { isPopoverOpen: false }
      }

      return null
    })
  }

  private onHideWhitespaceChangesChanged = (checked: boolean) => {
    this.props.onHideWhitespaceChangesChanged(checked)
  }

  private onLayoutChanged = (layout: DiffLayout) => {
    this.props.onShowSideBySideDiffChanged(layout === 'split')
  }

  public render() {
    const buttonLabel = `Diff ${__DARWIN__ ? 'Settings' : 'Options'}`
    return (
      <div className="diff-options-component" ref={this.diffOptionsRef}>
        <button
          aria-label={buttonLabel}
          onClick={this.onButtonClick}
          aria-expanded={this.state.isPopoverOpen}
          ref={this.innerButtonRef}
        >
          <Tooltip
            target={this.innerButtonRef}
            direction={TooltipDirection.NORTH}
            applyAriaDescribedBy={false}
            disabled={this.state.isPopoverOpen}
          >
            {buttonLabel}
          </Tooltip>
          <span ref={this.gearIconRef}>
            <Octicon symbol={octicons.gear} />
          </span>
          <Octicon
            className="diff-options-chevron"
            symbol={octicons.chevronDown}
          />
        </button>
        {this.state.isPopoverOpen && this.renderPopover()}
      </div>
    )
  }

  private renderPopover() {
    const header = `Diff ${__DARWIN__ ? 'Settings' : 'Options'}`
    return (
      <Popover
        className="diff-options-popover"
        ariaLabelledby="diff-options-popover-header"
        anchor={this.gearIconRef.current}
        anchorPosition={PopoverAnchorPosition.BottomRight}
        anchorOffset={8}
        decoration={PopoverDecoration.Bordered}
        onMousedownOutside={this.closePopover}
        onClickOutside={this.closePopover}
      >
        <h3 id="diff-options-popover-header">{header}</h3>
        {this.renderShowSideBySide()}
        {this.renderHideWhitespaceChanges()}
      </Popover>
    )
  }

  private renderShowSideBySide() {
    return (
      <div className="diff-option-row">
        <span id="diff-options-layout-label" className="diff-option-label">
          Layout
        </span>
        <SegmentedControl
          ariaLabelledBy="diff-options-layout-label"
          options={LayoutOptions}
          value={this.props.showSideBySideDiff ? 'split' : 'unified'}
          onChange={this.onLayoutChanged}
        />
      </div>
    )
  }

  private renderHideWhitespaceChanges() {
    const label = __DARWIN__ ? 'Hide Whitespace' : 'Hide whitespace'
    return (
      <div className="diff-option-group">
        <div className="diff-option-row">
          <span
            id="diff-options-whitespace-label"
            className="diff-option-label"
          >
            {label}
          </span>
          <Switch
            checked={this.props.hideWhitespaceChanges}
            onChange={this.onHideWhitespaceChangesChanged}
            ariaLabelledBy="diff-options-whitespace-label"
            ariaDescribedBy={
              this.props.isInteractiveDiff
                ? 'diff-options-whitespace-note'
                : undefined
            }
          />
        </div>
        {this.props.isInteractiveDiff && (
          <p id="diff-options-whitespace-note" className="diff-option-note">
            Line and hunk selection is turned off while whitespace is hidden.
          </p>
        )}
      </div>
    )
  }
}
