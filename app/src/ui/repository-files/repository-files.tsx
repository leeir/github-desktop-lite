import * as React from 'react'
import * as Path from 'path'
import memoizeOne from 'memoize-one'
import { AutoSizer, List as VirtualList, ListRowProps } from 'react-virtualized'
import { Repository } from '../../models/repository'
import {
  RepositoryFilePreview,
  readRepositoryFile,
} from '../../lib/repository-files'
import { highlight } from '../../lib/highlighter/worker'
import { ITokens, ILineTokens } from '../../lib/highlighter/types'
import { findInPreview, ICodeMatch } from '../../lib/repository-file-search'
import { RepositoryTree } from './repository-tree'
import { TextBox } from '../lib/text-box'
import { syntaxHighlightLine } from '../diff/diff-helpers'
import { Button } from '../lib/button'
import { Octicon, fileCode, search, x, arrowUp, arrowDown } from '../octicons'
import { Resizable } from '../resizable'
import { IConstrainedValue } from '../../lib/app-state'
import { writeClipboardText } from '../main-process-proxy'
import { showContextualMenu } from '../../lib/menu-item'

interface IRepositoryFilesProps {
  readonly repository: Repository
  readonly active: boolean
  readonly isShowingModal: boolean
  readonly revision: string
  readonly width: IConstrainedValue
  readonly onResize: (width: number) => void
  readonly onResetWidth: () => void
  readonly onOpenInExternalEditor: (path: string) => void
  readonly isExternalEditorAvailable: boolean
}

interface IRepositoryFilesState {
  readonly filePath: string | null
  readonly preview: RepositoryFilePreview | null
  readonly fileError: string | null
  readonly loadingFile: boolean
  readonly tokens: ITokens
  readonly copyLabel: string | null
  readonly findingCode: boolean
  readonly codeQuery: string
  readonly activeMatch: number
}

function errorMessage(error: NodeJS.ErrnoException): string {
  if (error.code === 'ENOENT') {
    return 'This item no longer exists. Refresh or go back to its parent folder.'
  }
  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return 'This item cannot be read with the current permissions.'
  }
  return error.message || 'This item could not be opened.'
}

/** One bounded preview and a lazy tree; no background repository indexing. */
export class RepositoryFiles extends React.PureComponent<
  IRepositoryFilesProps,
  IRepositoryFilesState
> {
  public state: IRepositoryFilesState = {
    filePath: null,
    preview: null,
    fileError: null,
    loadingFile: false,
    tokens: {},
    copyLabel: null,
    findingCode: false,
    codeQuery: '',
    activeMatch: 0,
  }
  private mounted = false
  private fileRequest = 0
  private highlighting = false
  private codeInput = React.createRef<TextBox>()
  private codeList = React.createRef<VirtualList>()
  private codeContainer = React.createRef<HTMLDivElement>()
  private findButton = React.createRef<Button>()
  private findMatches = memoizeOne(findInPreview)
  private findMatchesByLine = memoizeOne(
    (lines: ReadonlyArray<string>, query: string) => {
      const { matches, limited } = this.findMatches(lines, query)
      const byLine = new Map<
        number,
        Array<{ readonly match: ICodeMatch; readonly index: number }>
      >()
      matches.forEach((match, index) => {
        let list = byLine.get(match.line)
        if (list === undefined) {
          list = []
          byLine.set(match.line, list)
        }
        list.push({ match, index })
      })
      return { matches, limited, byLine }
    }
  )
  private longestLine = memoizeOne((lines: ReadonlyArray<string>) =>
    Math.max(...lines.map(line => line.replace(/\t/g, '    ').length))
  )
  private pendingHighlight: {
    request: number
    path: string
    lines: ReadonlyArray<string>
  } | null = null

  public componentDidMount() {
    this.mounted = true
    if (this.props.active) {
      this.refresh()
    }
    window.addEventListener('focus', this.onWindowFocus)
    document.addEventListener('find-text', this.onFindText)
    document.addEventListener('copy', this.onCopySelection)
  }
  public componentWillUnmount() {
    this.mounted = false
    this.fileRequest++
    this.pendingHighlight = null
    window.removeEventListener('focus', this.onWindowFocus)
    document.removeEventListener('find-text', this.onFindText)
    document.removeEventListener('copy', this.onCopySelection)
  }
  public componentDidUpdate(prevProps: IRepositoryFilesProps) {
    if (
      this.props.active &&
      (!prevProps.active || prevProps.revision !== this.props.revision)
    ) {
      this.refresh()
    }
    if (!this.props.active && prevProps.active) {
      this.fileRequest++
      this.pendingHighlight = null
    }
  }
  private onWindowFocus = () => {
    if (this.props.active) {
      this.refresh()
    }
  }
  private refresh = () => {
    if (this.state.filePath !== null) {
      this.loadFile(this.state.filePath, true)
    }
  }
  private loadFile = async (filePath: string, refresh = false) => {
    const request = ++this.fileRequest
    this.pendingHighlight = null
    const previous =
      refresh && filePath === this.state.filePath ? this.state.preview : null
    this.setState({
      filePath,
      preview: previous,
      tokens: previous === null ? {} : this.state.tokens,
      fileError: null,
      loadingFile: true,
      copyLabel: null,
      activeMatch: refresh ? this.state.activeMatch : 0,
    })
    try {
      const preview = await readRepositoryFile(
        this.props.repository.path,
        filePath
      )
      if (!this.mounted || request !== this.fileRequest) {
        return
      }
      const unchanged =
        previous?.kind === 'text' &&
        preview.kind === 'text' &&
        previous.size === preview.size &&
        previous.lines.length === preview.lines.length &&
        previous.lines.every((line, index) => line === preview.lines[index])
      this.setState(
        {
          preview: unchanged ? previous : preview,
          loadingFile: false,
          tokens: unchanged ? this.state.tokens : {},
          activeMatch: unchanged ? this.state.activeMatch : 0,
        },
        () => {
          if (!unchanged) {
            this.revealMatch()
          }
        }
      )
      if (unchanged && Object.keys(this.state.tokens).length > 0) {
        return
      }
      if (
        preview.kind === 'text' &&
        !preview.lines.some(line => line.length > 1000)
      ) {
        this.pendingHighlight = {
          request,
          path: filePath,
          lines: preview.lines,
        }
        this.highlightLatest()
      }
    } catch (error) {
      if (this.mounted && request === this.fileRequest) {
        this.setState({
          fileError: errorMessage(error),
          preview: null,
          tokens: {},
          loadingFile: false,
        })
      }
    }
  }
  // Serialize worker jobs; rapidly opening files never spawns a worker per click.
  private highlightLatest = async () => {
    if (this.highlighting) {
      return
    }
    this.highlighting = true
    try {
      while (
        this.pendingHighlight !== null &&
        this.mounted &&
        this.props.active
      ) {
        const job = this.pendingHighlight
        this.pendingHighlight = null
        const tokens = await highlight(
          job.lines,
          Path.basename(job.path),
          Path.extname(job.path),
          4,
          job.lines.map((_, i) => i)
        ).catch(() => ({}))
        if (this.mounted && job.request === this.fileRequest) {
          this.setState({ tokens })
        }
      }
    } finally {
      this.highlighting = false
    }
  }
  private renderLine = ({ index, key, style }: ListRowProps) => {
    const preview = this.state.preview
    if (preview?.kind !== 'text') {
      return null
    }
    const searchTokens: ILineTokens = {}
    if (this.state.findingCode && this.state.codeQuery.length > 0) {
      const lineMatches = this.findMatchesByLine(
        preview.lines,
        this.state.codeQuery
      ).byLine.get(index)
      if (lineMatches !== undefined) {
        for (const { match, index: matchIndex } of lineMatches) {
          searchTokens[match.start] = {
            length: match.length,
            token:
              matchIndex === this.state.activeMatch
                ? 'file-search-current'
                : 'file-search-match',
          }
        }
      }
    }
    return (
      <div key={key} style={style} className="repository-code-line">
        <span className="line-number" aria-hidden="true">
          {index + 1}
        </span>
        <code>
          {this.state.tokens[index] === undefined &&
          Object.keys(searchTokens).length === 0
            ? preview.lines[index]
            : syntaxHighlightLine(preview.lines[index], [
                this.state.tokens[index] ?? {},
                searchTokens,
              ])}
        </code>
      </div>
    )
  }
  private openInEditor = () => {
    if (this.state.filePath !== null) {
      this.props.onOpenInExternalEditor(
        Path.join(this.props.repository.path, this.state.filePath)
      )
    }
  }
  private copyPreview = async () => {
    if (this.state.preview?.kind !== 'text') {
      return
    }
    const request = this.fileRequest
    const copied = await writeClipboardText(this.state.preview.lines.join('\n'))
    if (this.mounted && request === this.fileRequest) {
      this.setState({ copyLabel: copied ? 'Copied' : 'Could not copy' })
    }
  }
  private selectedCode = () => {
    const container = this.codeContainer.current
    const selection = window.getSelection()
    if (
      !this.props.active ||
      this.props.isShowingModal ||
      container === null ||
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0 ||
      !container.contains(selection.anchorNode) ||
      !container.contains(selection.focusNode)
    ) {
      return null
    }
    const range = selection.getRangeAt(0)
    const parts: string[] = []
    // Only code cells participate: line numbers and search UI never reach the clipboard.
    for (const code of container.querySelectorAll('code')) {
      if (!range.intersectsNode(code)) {
        continue
      }
      const selected = document.createRange()
      selected.selectNodeContents(code)
      if (code.contains(range.startContainer)) {
        selected.setStart(range.startContainer, range.startOffset)
      }
      if (code.contains(range.endContainer)) {
        selected.setEnd(range.endContainer, range.endOffset)
      }
      parts.push(selected.toString())
    }
    return parts.length === 0 ? null : parts.join('\n')
  }
  private onCopySelection = (event: ClipboardEvent) => {
    const text = this.selectedCode()
    if (text !== null && event.clipboardData !== null) {
      event.clipboardData.setData('text/plain', text)
      event.preventDefault()
    }
  }
  private onCodeContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const text = this.selectedCode()
    showContextualMenu([
      {
        label: 'Copy',
        enabled: text !== null && text.length > 0,
        action: () => {
          if (text !== null) {
            writeClipboardText(text)
          }
        },
      },
      { type: 'separator' },
      {
        label:
          this.state.preview?.kind === 'text' && this.state.preview.limited
            ? 'Copy file preview'
            : 'Copy file',
        action: this.copyPreview,
      },
    ])
  }
  private onFindText = (event: Event) => {
    if (
      this.props.active &&
      !this.props.isShowingModal &&
      !event.defaultPrevented &&
      this.state.preview?.kind === 'text'
    ) {
      event.preventDefault()
      this.openCodeSearch()
    }
  }
  private openCodeSearch = () => {
    this.setState({ findingCode: true }, () => {
      this.codeInput.current?.focus()
      this.codeInput.current?.selectAll()
      this.revealMatch()
    })
  }
  private closeCodeSearch = () => {
    this.setState({ findingCode: false }, () =>
      this.findButton.current?.focus()
    )
  }
  private changeCodeQuery = (codeQuery: string) => {
    this.setState({ codeQuery, activeMatch: 0 }, this.revealMatch)
  }
  private moveMatch = (direction: number) => {
    const preview = this.state.preview
    if (preview?.kind !== 'text') {
      return
    }
    const count = this.findMatchesByLine(preview.lines, this.state.codeQuery)
      .matches.length
    if (count > 0) {
      this.setState(
        { activeMatch: (this.state.activeMatch + direction + count) % count },
        this.revealMatch
      )
    }
  }
  private nextMatch = () => this.moveMatch(1)
  private previousMatch = () => this.moveMatch(-1)
  private revealMatch = () => {
    const preview = this.state.preview
    if (!this.state.findingCode || preview?.kind !== 'text') {
      return
    }
    const match = this.findMatchesByLine(preview.lines, this.state.codeQuery)
      .matches[this.state.activeMatch]
    if (match !== undefined) {
      this.codeList.current?.scrollToRow(match.line)
      // After the virtual row mounts, reveal a match on a long line horizontally.
      requestAnimationFrame(this.revealHorizontalMatch)
    }
  }
  private revealHorizontalMatch = () => {
    if (this.mounted && this.props.active && this.state.findingCode) {
      this.codeContainer.current
        ?.querySelector('.cm-file-search-current')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }
  private onCodeKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.closeCodeSearch()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      this.moveMatch(event.shiftKey ? -1 : 1)
    }
  }
  private renderCodeSearch() {
    const { preview, findingCode, codeQuery, activeMatch } = this.state
    if (!findingCode || preview?.kind !== 'text') {
      return null
    }
    const { matches, limited } = this.findMatchesByLine(
      preview.lines,
      codeQuery
    )
    return (
      <div className="file-code-search">
        <TextBox
          ref={this.codeInput}
          ariaLabel="Find in current file"
          placeholder="Find in file…"
          value={codeQuery}
          onValueChanged={this.changeCodeQuery}
          onKeyDown={this.onCodeKeyDown}
          spellcheck={false}
        />
        <span className="file-match-count" role="status">
          {codeQuery.length === 0
            ? ''
            : matches.length === 0
            ? 'No matches'
            : `${activeMatch + 1} / ${matches.length}${limited ? '+' : ''}`}
        </span>
        <Button
          onClick={this.previousMatch}
          disabled={matches.length === 0}
          ariaLabel="Previous match"
          tooltip="Previous match (Shift+Enter)"
        >
          <Octicon symbol={arrowUp} />
        </Button>
        <Button
          onClick={this.nextMatch}
          disabled={matches.length === 0}
          ariaLabel="Next match"
          tooltip="Next match (Enter)"
        >
          <Octicon symbol={arrowDown} />
        </Button>
        <Button
          onClick={this.closeCodeSearch}
          ariaLabel="Close find"
          tooltip="Close (Escape)"
        >
          <Octicon symbol={x} />
        </Button>
        {preview.limited && (
          <small className="file-search-limit">Searching preview only</small>
        )}
      </div>
    )
  }
  private renderPreview() {
    const { preview, loadingFile, fileError } = this.state
    if (loadingFile && preview === null) {
      return (
        <div className="files-empty" role="status">
          Opening file…
        </div>
      )
    }
    if (fileError !== null) {
      return (
        <div className="files-empty" role="alert">
          {fileError}
        </div>
      )
    }
    if (preview === null) {
      return (
        <div className="files-empty">
          <Octicon symbol={fileCode} />
          <h2>Explore your project</h2>
          <p>Expand a folder or find a file to read its code.</p>
        </div>
      )
    }
    if (preview.kind !== 'text') {
      return (
        <div className="files-empty">
          <Octicon symbol={fileCode} />
          <h2>No code preview</h2>
          <p>
            {preview.kind === 'binary'
              ? 'This file is binary or uses an unsupported text encoding.'
              : 'Only regular text files can be previewed.'}
          </p>
        </div>
      )
    }
    if (preview.size === 0) {
      return <div className="files-empty">This file is empty.</div>
    }
    const longestLine = this.longestLine(preview.lines)
    return (
      <>
        {preview.limited && (
          <div className="files-notice" role="status">
            Preview limited for this file. Open it in your editor to read the
            rest.
          </div>
        )}
        <div
          ref={this.codeContainer}
          onContextMenu={this.onCodeContextMenu}
          className="repository-code cm-s-default"
          role="region"
          aria-label="Read-only code preview"
        >
          <AutoSizer>
            {({ width, height }) => (
              <VirtualList
                ref={this.codeList}
                key={this.state.filePath ?? ''}
                width={width}
                height={height}
                rowHeight={22}
                rowCount={preview.lines.length}
                rowRenderer={this.renderLine}
                overscanRowCount={8}
                tokens={this.state.tokens}
                codeQuery={this.state.codeQuery}
                activeMatch={this.state.activeMatch}
                findingCode={this.state.findingCode}
                containerStyle={{
                  minWidth: Math.max(width, longestLine * 8 + 76),
                }}
                style={{ overflowX: 'auto' }}
              />
            )}
          </AutoSizer>
        </div>
      </>
    )
  }
  public render() {
    const { filePath, preview, fileError } = this.state
    return (
      <div className="repository-files" hidden={!this.props.active}>
        <Resizable
          width={this.props.width.value}
          minimumWidth={this.props.width.min}
          maximumWidth={this.props.width.max}
          onResize={this.props.onResize}
          onReset={this.props.onResetWidth}
          description="File browser sidebar"
        >
          <RepositoryTree
            root={this.props.repository.path}
            name={this.props.repository.name}
            active={this.props.active}
            revision={this.props.revision}
            filePath={filePath}
            onOpenFile={this.loadFile}
            onRefreshPreview={this.refresh}
          />
        </Resizable>
        <section className="repository-file-preview">
          <div className="file-preview-header">
            <span className="file-preview-path">
              {filePath ?? 'File preview'}
            </span>
            {preview !== null && (
              <small>
                {preview.size < 1024
                  ? `${preview.size} B`
                  : `${Math.ceil(preview.size / 1024)} KB`}
              </small>
            )}
            {preview?.kind === 'text' && (
              <Button
                ref={this.findButton}
                onClick={this.openCodeSearch}
                ariaLabel="Find in file"
                tooltip={
                  __DARWIN__ ? 'Find in file (⌘F)' : 'Find in file (Ctrl+F)'
                }
              >
                <Octicon symbol={search} />
              </Button>
            )}
            {preview?.kind === 'text' && (
              <Button onClick={this.copyPreview}>
                {this.state.copyLabel ??
                  (preview.limited ? 'Copy preview' : 'Copy code')}
              </Button>
            )}
            {filePath !== null &&
              fileError === null &&
              preview?.kind === 'text' &&
              this.props.isExternalEditorAvailable && (
                <Button onClick={this.openInEditor}>Open in editor</Button>
              )}
          </div>
          {this.renderCodeSearch()}
          {this.renderPreview()}
        </section>
      </div>
    )
  }
}
