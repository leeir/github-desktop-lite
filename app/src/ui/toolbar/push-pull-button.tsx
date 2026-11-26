import * as React from 'react'

import { Progress } from '../../models/progress'
import { Repository } from '../../models/repository'
import { IAheadBehind } from '../../models/branch'
import { TipState } from '../../models/tip'
import { FetchType } from '../../models/fetch'
import { Resizable } from '../resizable'

import { Dispatcher } from '../dispatcher'
import {
  Octicon,
  OcticonSymbol,
  OcticonSymbolVariant,
  syncClockwise,
} from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RelativeTime } from '../relative-time'

import { ToolbarButton, ToolbarButtonStyle } from './button'
import {
  DropdownState,
  IToolbarDropdownProps,
  ToolbarDropdown,
  ToolbarDropdownStyle,
} from './dropdown'
import { FoldoutType, IConstrainedValue } from '../../lib/app-state'
import { ForcePushBranchState } from '../../lib/rebase'
import { PushPullButtonDropDown } from './push-pull-button-dropdown'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { enableResizingToolbarButtons } from '../../lib/feature-flag'
import { formatCompactNumber } from '../../lib/format-number'
import { Spinner, SpinnerDone, SpinnerGlyph } from '../lib/spinner'

/** How long the "done" state lingers after a successful push or pull. */
const CompletionFlashDuration = 2200

/**
 * How long after the progress ends we wait for ahead/behind to confirm that
 * the operation actually succeeded before giving up on the "done" state.
 */
const CompletionConfirmWindow = 5000

export const DropdownItemClassName = 'push-pull-dropdown-item'

interface IPushPullButtonProps {
  /**
   * The ahead/behind count for the current branch. If null, it indicates the
   * branch doesn't have an upstream.
   */
  readonly aheadBehind: IAheadBehind | null

  /** The name of the remote. */
  readonly remoteName: string | null

  /** Is a push/pull/fetch in progress? */
  readonly networkActionInProgress: boolean

  /** The date of the last fetch. */
  readonly lastFetched: Date | null

  /** Progress information associated with the current operation */
  readonly progress: Progress | null

  /** The global dispatcher, to invoke repository operations. */
  readonly dispatcher: Dispatcher

  /** The current repository */
  readonly repository: Repository

  /**
   * Indicate whether the current branch is valid, unborn or detached HEAD
   *
   * Used for setting the enabled/disabled and the description text.
   */
  readonly tipState: TipState

  /** Has the user configured pull.rebase to anything? */
  readonly pullWithRebase?: boolean

  /** Is the detached HEAD state related to a rebase or not? */
  readonly rebaseInProgress: boolean

  /** Force push state of the current branch */
  readonly forcePushBranchState: ForcePushBranchState

  /**
   * The number of tags that would get pushed if the user performed a push.
   */
  readonly numTagsToPush: number

  /** Whether or not the push-pull dropdown is currently open */
  readonly isDropdownOpen: boolean

  /** Will the app prompt the user to confirm a force push? */
  readonly askForConfirmationOnForcePush: boolean

  /** Whether the dropdown will trap focus or not. Defaults to true.
   *
   * Example of usage: If a dropdown is open and then a dialog subsequently, the
   * focus trap logic will stop propagation of the focus event to the dialog.
   * Thus, we want to disable this when dialogs are open since they will be
   * using the dialog focus management.
   */
  readonly enableFocusTrap: boolean

  /** The width of the resizable push/pull button, as derived from AppState. */
  readonly pushPullButtonWidth: IConstrainedValue

  /**
   * An event handler for when the drop down is opened, or closed, by a pointer
   * event or by pressing the space or enter key while focused.
   *
   * @param state    - The new state of the drop down
   */
  readonly onDropdownStateChanged: (state: DropdownState) => void
}

type ActionInProgress = 'push' | 'pull' | 'fetch' | 'force push'

type CompletedAction = 'push' | 'pull'

interface IPushPullButtonState {
  readonly screenReaderStateMessage: string | null
  readonly actionInProgress: ActionInProgress | null

  /** A push or pull that just succeeded, shown briefly as a done state. */
  readonly completedAction: CompletedAction | null
}

export enum DropdownItemType {
  Fetch = 'fetch',
  ForcePush = 'force-push',
}

export type DropdownItem = {
  readonly title: string
  readonly description: string | JSX.Element
  readonly action: () => void
  readonly icon: OcticonSymbol
}

function renderAheadBehind(aheadBehind: IAheadBehind, numTagsToPush: number) {
  const { ahead, behind } = aheadBehind
  if (ahead === 0 && behind === 0 && numTagsToPush === 0) {
    return null
  }

  const content = new Array<JSX.Element>()
  if (behind > 0) {
    content.push(
      <span key="behind" className="sync-incoming">
        <Octicon symbol={octicons.arrowDown} />
        {formatCompactNumber(behind)}
      </span>
    )
  }

  if (ahead > 0) {
    content.push(
      <span key="ahead" className="sync-outgoing">
        <Octicon symbol={octicons.arrowUp} />
        {formatCompactNumber(ahead)}
      </span>
    )
  }

  if (numTagsToPush > 0) {
    content.push(
      <span key="tags">
        {formatCompactNumber(numTagsToPush)}{' '}
        {numTagsToPush === 1 ? 'tag' : 'tags'}
      </span>
    )
  }

  return <span className="sync-status">{content}</span>
}

function renderLastFetched(lastFetched: Date | null): JSX.Element | string {
  // A faint note after the button title; the tooltip carries the full date.
  if (lastFetched) {
    return (
      <span className="last-fetched">
        <RelativeTime date={lastFetched} />
      </span>
    )
  } else {
    return 'Not checked yet'
  }
}

/** Distinct upward arrow for force-push. */
export const forcePushIcon: OcticonSymbolVariant = {
  ...octicons.forcePush[16],
  h: 16,
  w: 16,
}

/**
 * A button which pushes, pulls, or updates depending on the state of the
 * repository.
 */
export class PushPullButton extends React.Component<
  IPushPullButtonProps,
  IPushPullButtonState
> {
  private pendingCompletion: {
    readonly kind: CompletedAction
    readonly until: number
  } | null = null

  private completionTimer: number | null = null

  public constructor(props: IPushPullButtonProps) {
    super(props)
    this.state = {
      screenReaderStateMessage: null,
      actionInProgress: null,
      completedAction: null,
    }
  }

  public componentWillUnmount() {
    if (this.completionTimer !== null) {
      window.clearTimeout(this.completionTimer)
    }
  }

  /**
   * Progress ends the same way whether an operation succeeded or failed, so
   * only celebrate once ahead/behind confirms there is nothing left to do.
   */
  private checkPendingCompletion() {
    const pending = this.pendingCompletion
    if (pending === null) {
      return
    }

    const { progress, networkActionInProgress, aheadBehind } = this.props
    if (progress !== null || Date.now() > pending.until) {
      this.pendingCompletion = null
      return
    }

    if (networkActionInProgress || aheadBehind === null) {
      return
    }

    const settled =
      pending.kind === 'push'
        ? aheadBehind.ahead === 0
        : aheadBehind.behind === 0
    if (!settled) {
      return
    }

    this.pendingCompletion = null
    if (this.completionTimer !== null) {
      window.clearTimeout(this.completionTimer)
    }
    this.setState({ completedAction: pending.kind })
    this.completionTimer = window.setTimeout(() => {
      this.completionTimer = null
      this.setState({ completedAction: null })
    }, CompletionFlashDuration)
  }

  private dismissCompleted = () => {
    if (this.completionTimer !== null) {
      window.clearTimeout(this.completionTimer)
      this.completionTimer = null
    }
    this.setState({ completedAction: null })
  }

  public componentDidUpdate(prevProps: IPushPullButtonProps) {
    const progressChanged =
      (this.props.progress !== null && prevProps.progress == null) ||
      this.props.progress?.title !== prevProps.progress?.title

    const progressComplete =
      this.props.progress === null && prevProps.progress !== null

    if (progressChanged) {
      this.setScreenReaderLoadingStateMessage()
    }

    if (progressComplete) {
      const kind = this.state.actionInProgress ?? prevProps.progress?.kind
      if (kind === 'push' || kind === 'pull') {
        this.pendingCompletion = {
          kind,
          until: Date.now() + CompletionConfirmWindow,
        }
      }
      this.setState({
        screenReaderStateMessage: `${
          this.state.actionInProgress ?? 'Pull, push, or fetch'
        } finished`,
        actionInProgress: null,
      })
    }

    this.checkPendingCompletion()
  }

  private isPullPushFetchProgress(kind: string): kind is ActionInProgress {
    return kind === 'push' || kind === 'pull' || kind === 'fetch'
  }

  private setScreenReaderLoadingStateMessage() {
    const { progress } = this.props

    if (progress === null) {
      return
    }

    const { description, title, kind } = progress
    const screenReaderStateMessage = `${title ?? 'Syncing…'} ${
      description ?? 'In progress'
    }`
    const actionInProgress: ActionInProgress | null =
      this.state.actionInProgress === null && this.isPullPushFetchProgress(kind)
        ? kind
        : this.state.actionInProgress

    this.setState({ screenReaderStateMessage, actionInProgress })
  }

  /** The common props for all button states */
  private defaultButtonProps() {
    return {
      className: 'push-pull-button',
      style: ToolbarButtonStyle.Standard,
    }
  }

  /** The common props for all dropdown states */
  private defaultDropdownProps(): Omit<
    IToolbarDropdownProps,
    'dropdownContentRenderer'
  > {
    return {
      buttonClassName: 'push-pull-button',
      style: ToolbarButtonStyle.Standard,
      dropdownStyle: ToolbarDropdownStyle.MultiOption,
      ariaLabel: 'Push, pull, fetch options',
      dropdownState: this.props.isDropdownOpen ? 'open' : 'closed',
      enableFocusTrap: this.props.enableFocusTrap,
      onDropdownStateChanged: this.props.onDropdownStateChanged,
      // The button sizes to its label, so keep the options readable.
      foldoutStyleOverrides: { minWidth: 272, width: 272 },
    }
  }

  private closeDropdown() {
    this.props.dispatcher.closeFoldout(FoldoutType.PushPull)
  }

  private push = () => {
    this.closeDropdown()
    this.props.dispatcher.push(this.props.repository)
  }

  /**
   * The dropdown focus trap has logic to set the document.ActiveElement to the
   * html element (in this case the dropdown button) that was clicked to
   * activate the focus trap. It also has a returnFocusOnDeactivate prop that is
   * true by default, but can be set to false to prevent this behavior.
   *
   * In the case of force push that opens a confirm dialog, we want to set the
   * focus to the aria live container and therefore we set
   * returnFocusOnDeactivate to false. We also provided the onDeactivate
   * callback of the focus trap to set that focus. See more details in
   * setScreenReaderStateMessageFocus()
   *
   * @returns true - (default behavior) if not force push, or if force and confirmation is off
   * @returns false -if force push and confirmation is on, so we can manage focus ourselves
   * */
  private returnFocusOnDeactivate = () => {
    const isForcePushOptionAvailable =
      this.props.forcePushBranchState !== ForcePushBranchState.NotAvailable

    return (
      !isForcePushOptionAvailable || !this.props.askForConfirmationOnForcePush
    )
  }

  /**
   * In the case of force push that opens a confirm dialog, we want to set the
   * focus to the aria live container and we do so on the onDeactivate callback
   * of the focus trap to set that focus. Additionally, we set
   * returnFocusOnDeactivate to false to prevent the dropdowns focus traps
   * default focus management.  See more details in
   * setScreenReaderStateMessageFocus()*/
  private onDropdownFocusTrapDeactivate = () => {
    if (this.returnFocusOnDeactivate()) {
      return
    }

    this.setScreenReaderStateMessageFocus()
  }

  /**
   * This is a hack to get the screen reader to read the message after the force
   * push confirm dialog closes.
   *
   * Problem: The dialog component sets the focus back to what ever was in the
   * `document.ActiveElement` when the dialog was opened. However the active
   * element is the force push button that is replaced with the fetch button.
   * Thus, the force push element is no longer present when the dialog closes
   * and the focus defaults to the document body. This means the sr message is
   * not read.
   *
   * Solution: Set the `document.ActiveElement` to an element containing the sr
   * element before opening the dialog so that it returns the focus to an
   * element containing the sr. You can do this by calling the `focus` element
   * of a tab focusable element hence adding the tab index.
   *
   * Other notes: If I set the focus to the sr element directly, it causes the
   * message to be read twice.
   */
  private setScreenReaderStateMessageFocus() {
    const srElement = document.getElementById('push-pull-button-state')
    if (srElement) {
      srElement.tabIndex = -1
      srElement.focus()
    }
  }

  private forcePushWithLease = () => {
    this.closeDropdown()

    this.setScreenReaderStateMessageFocus()
    this.props.dispatcher.confirmOrForcePush(this.props.repository)

    this.setState({ actionInProgress: 'force push' })
  }

  private pull = () => {
    this.closeDropdown()
    this.props.dispatcher.pull(this.props.repository)
  }

  private fetch = () => {
    this.closeDropdown()

    this.props.dispatcher.fetch(
      this.props.repository,
      FetchType.UserInitiatedTask
    )
  }

  /**
   * Handler called when the width of the push/pull button has changed
   * through an explicit resize event to the given width.
   *
   * @param width The new width of resizable button.
   */
  private onResize = (width: number) => {
    this.props.dispatcher.setPushPullButtonWidth(width)
  }

  /**
   * Handler called when the resizable push/pull button has been
   * asked to restore its original width.
   */
  private onReset = () => {
    this.props.dispatcher.resetPushPullButtonWidth()
  }

  private getDropdownContentRenderer(
    itemTypes: ReadonlyArray<DropdownItemType>
  ) {
    return () => {
      return (
        <PushPullButtonDropDown
          itemTypes={itemTypes}
          remoteName={this.props.remoteName}
          fetch={this.fetch}
          forcePushWithLease={this.forcePushWithLease}
          askForConfirmationOnForcePush={
            this.props.askForConfirmationOnForcePush
          }
        />
      )
    }
  }

  public render() {
    if (!enableResizingToolbarButtons()) {
      return (
        <>
          {this.renderButton()}
          <span id="push-pull-button-state">
            <AriaLiveContainer message={this.state.screenReaderStateMessage} />
          </span>
        </>
      )
    }

    return (
      <>
        <Resizable
          width={this.props.pushPullButtonWidth.value}
          onReset={this.onReset}
          onResize={this.onResize}
          maximumWidth={this.props.pushPullButtonWidth.max}
          minimumWidth={this.props.pushPullButtonWidth.min}
          description="Push pull button"
        >
          {this.renderButton()}
          <span id="push-pull-button-state">
            <AriaLiveContainer message={this.state.screenReaderStateMessage} />
          </span>
        </Resizable>
      </>
    )
  }

  private renderButton() {
    const {
      progress,
      networkActionInProgress,
      aheadBehind,
      numTagsToPush,
      remoteName,
      repository,
      tipState,
      rebaseInProgress,
      lastFetched,
      pullWithRebase,
      forcePushBranchState,
    } = this.props

    if (progress !== null) {
      return this.progressButton(progress, networkActionInProgress)
    }

    if (networkActionInProgress) {
      return this.progressButton(
        { kind: 'generic', value: 0, title: 'Connecting…' },
        true
      )
    }

    if (this.state.completedAction !== null && remoteName !== null) {
      return this.completedButton(this.state.completedAction, remoteName)
    }

    if (remoteName === null) {
      return this.publishRepositoryButton(this.push)
    }

    if (tipState === TipState.Unborn) {
      return this.fetchButton(remoteName, lastFetched, this.fetch)
    }

    if (tipState === TipState.Detached) {
      return this.detachedHeadButton(rebaseInProgress)
    }

    if (aheadBehind === null) {
      const isGitHubRepository = repository.gitHubRepository !== null
      return this.publishBranchButton(isGitHubRepository, this.push)
    }

    const { ahead, behind } = aheadBehind

    if (ahead === 0 && behind === 0 && numTagsToPush === 0) {
      return this.fetchButton(remoteName, lastFetched, this.fetch)
    }

    if (forcePushBranchState === ForcePushBranchState.Recommended) {
      return this.forcePushButton(
        remoteName,
        aheadBehind,
        numTagsToPush,
        lastFetched,
        this.forcePushWithLease
      )
    }

    if (behind > 0) {
      return this.pullButton(
        remoteName,
        aheadBehind,
        numTagsToPush,
        lastFetched,
        pullWithRebase || false,
        forcePushBranchState,
        this.pull
      )
    }

    return this.pushButton(
      remoteName,
      aheadBehind,
      numTagsToPush,
      lastFetched,
      this.push
    )
  }

  private progressButton(progress: Progress, networkActionInProgress: boolean) {
    const value = Number.isFinite(progress.value)
      ? Math.max(0, Math.min(1, progress.value))
      : 0
    const detail =
      progress.kind === 'fetch'
        ? value > 0
          ? 'Receiving'
          : 'Checking…'
        : progress.kind === 'pull'
        ? networkActionInProgress
          ? 'Downloading'
          : 'Updating'
        : progress.kind === 'push'
        ? 'Uploading'
        : networkActionInProgress
        ? 'Waiting…'
        : 'Refreshing'
    const title = progress.title ?? 'Syncing…'
    const glyph: SpinnerGlyph | undefined =
      progress.kind === 'push'
        ? 'up'
        : progress.kind === 'pull' || progress.kind === 'fetch'
        ? 'down'
        : undefined
    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        className={`push-pull-button sync-in-progress${
          value === 0 ? ' sync-indeterminate' : ''
        }`}
        title={title}
        description={
          <span className="sync-progress-detail">
            <span className="sync-detail-label">{detail}</span>
            {value > 0 && (
              <span className="sync-percentage">
                {Math.floor(value * 100)}%
              </span>
            )}
          </span>
        }
        iconElement={<Spinner size={18} value={value} glyph={glyph} />}
        iconClassName="is-busy"
        tooltip={progress.description ?? `${title} — ${detail}`}
        disabled={true}
      >
        <span className="sync-progress-track" aria-hidden="true">
          <span
            className="sync-progress-fill"
            style={{ transform: `scaleX(${value})` }}
          />
        </span>
      </ToolbarButton>
    )
  }

  private completedButton(kind: CompletedAction, remoteName: string) {
    const title =
      kind === 'push' ? `Pushed to ${remoteName}` : `Pulled from ${remoteName}`
    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        className="push-pull-button sync-complete"
        title={title}
        description="Up to date"
        iconElement={<SpinnerDone size={18} />}
        iconClassName="is-done"
        onClick={this.dismissCompleted}
      />
    )
  }

  private publishRepositoryButton(onClick: () => void) {
    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        title="Publish repository"
        description="Publish this repository to GitHub"
        className="push-pull-button"
        icon={octicons.upload}
        style={ToolbarButtonStyle.Standard}
        onClick={onClick}
      />
    )
  }

  private detachedHeadButton(rebaseInProgress: boolean) {
    const description = rebaseInProgress
      ? 'Rebase in progress'
      : 'Cannot publish detached HEAD'

    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        title="Publish branch"
        description={description}
        icon={octicons.upload}
        disabled={true}
      />
    )
  }

  private publishBranchButton(isGitHub: boolean, onClick: () => void) {
    const description = isGitHub
      ? 'Publish this branch to GitHub'
      : 'Publish this branch to the remote'

    const className = this.defaultDropdownProps().className

    return (
      <ToolbarDropdown
        {...this.defaultDropdownProps()}
        title="Publish branch"
        description={description}
        icon={octicons.upload}
        onClick={onClick}
        className={className}
        dropdownContentRenderer={this.getDropdownContentRenderer([
          DropdownItemType.Fetch,
        ])}
      />
    )
  }

  private fetchButton(
    remoteName: string,
    lastFetched: Date | null,
    onClick: () => void
  ) {
    const title = `Fetch ${remoteName}`
    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        title={title}
        description={renderLastFetched(lastFetched)}
        tooltip={
          lastFetched
            ? `Last checked ${lastFetched.toLocaleString()}`
            : `Fetch updates from ${remoteName}`
        }
        icon={syncClockwise}
        onClick={onClick}
      />
    )
  }

  private pullButton(
    remoteName: string,
    aheadBehind: IAheadBehind,
    numTagsToPush: number,
    lastFetched: Date | null,
    pullWithRebase: boolean,
    forcePushBranchState: ForcePushBranchState,
    onClick: () => void
  ) {
    const title = pullWithRebase
      ? `Pull ${remoteName} with rebase`
      : `Pull ${remoteName}`

    const dropdownItemTypes = [DropdownItemType.Fetch]

    if (forcePushBranchState !== ForcePushBranchState.NotAvailable) {
      dropdownItemTypes.push(DropdownItemType.ForcePush)
    }

    return (
      <ToolbarDropdown
        {...this.defaultDropdownProps()}
        title={title}
        description={
          renderAheadBehind(aheadBehind, numTagsToPush) ??
          renderLastFetched(lastFetched)
        }
        tooltip={
          lastFetched
            ? `${title} · Last checked ${lastFetched.toLocaleString()}`
            : title
        }
        icon={octicons.arrowDown}
        onClick={onClick}
        dropdownContentRenderer={this.getDropdownContentRenderer(
          dropdownItemTypes
        )}
        returnFocusOnDeactivate={this.returnFocusOnDeactivate()}
        onDropdownFocusTrapDeactivate={this.onDropdownFocusTrapDeactivate}
      />
    )
  }

  private pushButton(
    remoteName: string,
    aheadBehind: IAheadBehind,
    numTagsToPush: number,
    lastFetched: Date | null,
    onClick: () => void
  ) {
    return (
      <ToolbarDropdown
        {...this.defaultDropdownProps()}
        title={`Push ${remoteName}`}
        description={
          renderAheadBehind(aheadBehind, numTagsToPush) ??
          renderLastFetched(lastFetched)
        }
        tooltip={
          lastFetched
            ? `Push ${remoteName} · Last checked ${lastFetched.toLocaleString()}`
            : `Push ${remoteName}`
        }
        icon={octicons.arrowUp}
        onClick={onClick}
        dropdownContentRenderer={this.getDropdownContentRenderer([
          DropdownItemType.Fetch,
        ])}
      />
    )
  }

  private forcePushButton(
    remoteName: string,
    aheadBehind: IAheadBehind,
    numTagsToPush: number,
    lastFetched: Date | null,
    onClick: () => void
  ) {
    return (
      <ToolbarDropdown
        {...this.defaultDropdownProps()}
        title={`Force push ${remoteName}`}
        description={
          renderAheadBehind(aheadBehind, numTagsToPush) ??
          renderLastFetched(lastFetched)
        }
        tooltip={
          lastFetched
            ? `Force push ${remoteName} · Last checked ${lastFetched.toLocaleString()}`
            : `Force push ${remoteName}`
        }
        icon={forcePushIcon}
        onClick={onClick}
        dropdownContentRenderer={this.getDropdownContentRenderer([
          DropdownItemType.Fetch,
        ])}
      />
    )
  }
}
