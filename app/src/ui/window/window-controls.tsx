import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import * as React from 'react'
import { WindowState } from '../../lib/window-state'
import classNames from 'classnames'
import {
  closeWindow,
  getCurrentWindowState,
  maximizeWindow,
  minimizeWindow,
  restoreWindow,
} from '../main-process-proxy'
import * as ipcRenderer from '../../lib/ipc-renderer'
import { Button } from '../lib/button'

interface IWindowControlState {
  readonly windowState: WindowState | null
}

/**
 * A component replicating typical win32 window controls in frameless windows
 *
 * Note that the component only supports the Windows platform at the moment
 * and will render nothing when used on other platforms.
 *
 * Uses the electron remote module to perform window state actions on the
 * current window. Relies on the custom ipc channel 'window-state-changed' to
 * be configured in the main process. The channel should emit an event at least
 * every time there's a change in the window state but _may_ send duplicate
 * or out-of-bound events communicating the _current_ state as well.
 */
export class WindowControls extends React.Component<{}, IWindowControlState> {
  public componentWillMount() {
    this.setState({ windowState: null })
    this.initializeWindowState()
    ipcRenderer.on('window-state-changed', this.onWindowStateChanged)
  }

  private initializeWindowState = async () => {
    const windowState = await getCurrentWindowState()
    if (windowState === undefined) {
      return
    }

    this.setState({ windowState })
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener(
      'window-state-changed',
      this.onWindowStateChanged
    )
  }

  // Note: The following four wrapping methods are necessary on windows.
  // Otherwise, you get a object cloning error.
  private onMinimize = () => {
    minimizeWindow()
  }

  private onMaximize = () => {
    maximizeWindow()
  }

  private onRestore = () => {
    restoreWindow()
  }

  private onClose = () => {
    closeWindow()
  }

  public shouldComponentUpdate(nextProps: {}, nextState: IWindowControlState) {
    return nextState.windowState !== this.state.windowState
  }

  private onWindowStateChanged = (
    _: Electron.IpcRendererEvent,
    windowState: WindowState
  ) => {
    this.setState({ windowState })
  }

  private renderButton(
    name: string,
    onClick: React.EventHandler<React.MouseEvent<any>>,
    symbol: OcticonSymbol
  ) {
    const className = classNames('window-control', name)
    const title = name[0].toUpperCase() + name.substring(1)

    return (
      <Button
        ariaLabel={title}
        ariaHidden={true}
        tabIndex={-1}
        className={className}
        onClick={onClick}
        tooltip={title}
        tooltipClassName="window-controls-tooltip"
      >
        <Octicon symbol={symbol} height={12} />
      </Button>
    )
  }

  public render() {
    // We only know how to render fake Windows-y controls
    if (!__WIN32__) {
      return <span />
    }

    const min = this.renderButton('minimize', this.onMinimize, octicons.dash)
    const maximizeOrRestore =
      this.state.windowState === 'maximized'
        ? this.renderButton('restore', this.onRestore, octicons.restore)
        : this.renderButton('maximize', this.onMaximize, octicons.maximize)
    const close = this.renderButton('close', this.onClose, octicons.x)

    return (
      <div className="window-controls">
        {min}
        {maximizeOrRestore}
        {close}
      </div>
    )
  }
}
