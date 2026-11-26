import type {
  ITerminalOptions,
  ITerminalInitOnlyOptions,
  Terminal as XTermTerminal,
} from '@xterm/xterm'
import React from 'react'
import { getMonospaceFontFamily } from './get-monospace-font-family'
import { TerminalOutput } from '../lib/git'

export const defaultTerminalOptions: Readonly<ITerminalOptions> = {
  convertEol: true,
  fontFamily: getMonospaceFontFamily(),
  fontSize: 12,
  screenReaderMode: true,
}

export type TerminalProps = ITerminalOptions &
  ITerminalInitOnlyOptions & {
    readonly terminalOutput?: TerminalOutput
    readonly hideCursor?: boolean
  }

export class Terminal extends React.Component<TerminalProps> {
  private terminalRef = React.createRef<HTMLDivElement>()
  private terminal: XTermTerminal | null = null
  private pendingWrites = new Array<TerminalOutput>()
  private unmounted = false

  public get Terminal() {
    return this.terminal
  }

  public write(data: TerminalOutput) {
    if (this.terminal === null) {
      this.pendingWrites.push(data)
      return
    }
    if (Array.isArray(data)) {
      data.forEach(chunk => this.terminal?.write(chunk))
    } else {
      this.terminal?.write(data)
    }
  }

  public componentWillUnmount(): void {
    this.unmounted = true
    this.pendingWrites = []
    this.terminal?.dispose()
    this.terminal = null
  }

  public async componentDidMount() {
    const { Terminal: XTermTerminal } = await import('@xterm/xterm')
    if (this.unmounted || !this.terminalRef.current) {
      return
    }

    const { terminalOutput, hideCursor, ...initOpts } = this.props
    this.terminal = new XTermTerminal({
      ...defaultTerminalOptions,
      ...initOpts,

      rows: this.props.rows ?? 20,
      cols: this.props.cols ?? 80,
    })

    this.terminal.attachCustomKeyEventHandler((key: KeyboardEvent) => {
      if (key.key === 'Tab') {
        // We don't want to handle tab key events in the terminal as it
        // breaks tab navigation in the app. The terminal is read only and
        // doesn't support tab input, so we can safely ignore it.
        return false
      }
      return true
    })

    this.terminal.open(this.terminalRef.current)

    if (hideCursor !== false) {
      this.terminal.write('\x1b[?25l') // hide cursor
      if (terminalOutput) {
        this.write(terminalOutput)
      }
    }

    if (this.pendingWrites.length > 0) {
      const queued = this.pendingWrites
      this.pendingWrites = []
      queued.forEach(chunk => this.write(chunk))
    }
  }

  public render() {
    return <div ref={this.terminalRef}></div>
  }
}
