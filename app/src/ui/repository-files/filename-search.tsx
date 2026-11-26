import * as React from 'react'
import {
  IFilenameMatches,
  searchRepositoryFiles,
} from '../../lib/repository-file-search'
import { List } from '../lib/list'
import { TextBox } from '../lib/text-box'
import { Octicon, search, fileCode } from '../octicons'

interface IProps {
  readonly root: string
  readonly active: boolean
  readonly revision: string
  readonly onSearchingChanged: (searching: boolean) => void
  readonly onOpenFile: (path: string) => void
}
interface IState {
  readonly query: string
  readonly result: IFilenameMatches | null
  readonly error: boolean
  readonly selected: number
}

export class FilenameSearch extends React.PureComponent<IProps, IState> {
  public state: IState = { query: '', result: null, error: false, selected: 0 }
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private input = React.createRef<TextBox>()

  public componentDidMount() {
    window.addEventListener('focus', this.refresh)
  }
  public componentWillUnmount() {
    this.cancel()
    window.removeEventListener('focus', this.refresh)
  }
  public componentDidUpdate(prevProps: IProps) {
    if (!this.props.active && prevProps.active) {
      this.cancel()
    } else if (
      this.props.active &&
      (!prevProps.active || prevProps.revision !== this.props.revision)
    ) {
      this.refresh()
    }
  }
  private cancel = () => {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.controller?.abort()
    this.controller = null
  }
  public clear = () => this.changeQuery('')
  public refresh = () => {
    if (this.props.active) {
      this.changeQuery(this.state.query)
    }
  }
  private changeQuery = (query: string) => {
    this.cancel()
    this.setState({ query, result: null, error: false, selected: 0 })
    const searching = query.trim().length > 0
    this.props.onSearchingChanged(searching)
    if (!searching) {
      return
    }
    const controller = new AbortController()
    this.controller = controller
    this.timer = setTimeout(async () => {
      this.timer = null
      try {
        const result = await searchRepositoryFiles(
          this.props.root,
          query,
          controller.signal
        )
        if (!controller.signal.aborted) {
          this.setState({ result })
        }
      } catch {
        if (!controller.signal.aborted) {
          this.setState({ error: true })
        }
      }
    }, 200)
  }
  private openRow = (row: number) => {
    const entry = this.state.result?.entries[row]
    if (entry !== undefined) {
      this.props.onOpenFile(entry.path)
    }
  }
  private selectRow = (selected: number) => this.setState({ selected })
  private onKeyDown = (event: React.KeyboardEvent) => {
    const count = this.state.result?.entries.length ?? 0
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.changeQuery('')
      this.input.current?.focus()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (count > 0) {
        this.selectRow(
          (this.state.selected + (event.key === 'ArrowDown' ? 1 : -1) + count) %
            count
        )
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      this.openRow(this.state.selected)
    }
  }
  private onResultKeyDown = (_row: number, event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.onKeyDown(event)
    }
  }
  private rowLabel = (row: number) => this.state.result!.entries[row].path
  private renderRow = (row: number) => {
    const entry = this.state.result!.entries[row]
    return (
      <div className="repository-file-entry filename-match">
        <Octicon symbol={fileCode} />
        <span>
          <span>{entry.name}</span>
          <small>{entry.path}</small>
        </span>
      </div>
    )
  }
  public render() {
    const { query, result, error, selected } = this.state
    const searching = query.trim().length > 0
    return (
      <div className={`filename-search${searching ? ' is-searching' : ''}`}>
        <TextBox
          ref={this.input}
          ariaLabel="Find a file"
          placeholder="Find a file…"
          type="search"
          prefixedIcon={search}
          value={query}
          onValueChanged={this.changeQuery}
          onKeyDown={this.onKeyDown}
          displayClearButton={true}
          spellcheck={false}
        />
        {searching && (
          <>
            <div className="filename-search-scope">
              Repository files · Ignored files excluded
            </div>
            <div className="files-directory-list">
              {error ? (
                <p className="files-list-message" role="alert">
                  Could not search files. Refresh to try again.
                </p>
              ) : result === null ? (
                <p className="files-list-message" role="status">
                  Finding files…
                </p>
              ) : result.entries.length === 0 ? (
                <p className="files-list-message">
                  {result.limited
                    ? 'Search stopped early. Try a more specific filename.'
                    : 'No matching files.'}
                </p>
              ) : (
                <List
                  rowCount={result.entries.length}
                  rowHeight={46}
                  rowRenderer={this.renderRow}
                  selectedRows={[selected]}
                  onSelectedRowChanged={this.selectRow}
                  onRowClick={this.openRow}
                  onRowKeyDown={this.onResultKeyDown}
                  getRowAriaLabel={this.rowLabel}
                  ariaLabel="Matching files"
                  invalidationProps={result}
                  scrollToRow={selected}
                />
              )}
            </div>
            {result !== null && (
              <div className="files-directory-footer" role="status">
                {result.limited
                  ? `${result.entries.length} matches shown · Refine your search`
                  : `${result.entries.length} ${
                      result.entries.length === 1 ? 'file' : 'files'
                    } found`}
              </div>
            )}
          </>
        )}
      </div>
    )
  }
}
