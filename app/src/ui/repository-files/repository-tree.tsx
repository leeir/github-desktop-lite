import * as React from 'react'
import * as Path from 'path'
import memoizeOne from 'memoize-one'
import { AutoSizer, List as VirtualList, ListRowProps } from 'react-virtualized'
import {
  IRepositoryDirectory,
  IRepositoryEntry,
  readRepositoryDirectory,
} from '../../lib/repository-files'
import { Button } from '../lib/button'
import {
  Octicon,
  fileCode,
  fileDirectory,
  chevronRight,
  chevronDown,
  sync,
  fold,
} from '../octicons'
import { FilenameSearch } from './filename-search'

const MaxTreeEntries = 20000
interface ITreeRow {
  readonly entry: IRepositoryEntry
  readonly depth: number
}
interface IProps {
  readonly root: string
  readonly name: string
  readonly active: boolean
  readonly revision: string
  readonly filePath: string | null
  readonly onOpenFile: (path: string) => void
  readonly onRefreshPreview: () => void
}
interface IState {
  readonly directories: ReadonlyMap<string, IRepositoryDirectory>
  readonly expanded: ReadonlySet<string>
  readonly loading: ReadonlySet<string>
  readonly errors: ReadonlySet<string>
  readonly selected: string | null
  readonly searching: boolean
}

/** Lazy, virtualized tree. Collapsing a directory releases its cached descendants. */
export class RepositoryTree extends React.PureComponent<IProps, IState> {
  public state: IState = {
    directories: new Map(),
    expanded: new Set(),
    loading: new Set(),
    errors: new Set(),
    selected: null,
    searching: false,
  }
  private mounted = false
  private reading = false
  private requestID = 0
  private requests = new Map<string, number>()
  private queue: Array<{ path: string; id: number }> = []
  private tree = React.createRef<HTMLDivElement>()
  private filenameSearch = React.createRef<FilenameSearch>()
  private rows = memoizeOne(
    (directories: IState['directories'], expanded: IState['expanded']) => {
      const result: ITreeRow[] = []
      const append = (path: string, depth: number) => {
        for (const entry of directories.get(path)?.entries ?? []) {
          result.push({ entry, depth })
          if (entry.kind === 'directory' && expanded.has(entry.path)) {
            append(entry.path, depth + 1)
          }
        }
      }
      append('', 1)
      return result
    }
  )

  public componentDidMount() {
    this.mounted = true
    if (this.props.active) {
      this.refresh()
    }
    window.addEventListener('focus', this.onFocus)
  }
  public componentWillUnmount() {
    this.mounted = false
    this.cancel()
    window.removeEventListener('focus', this.onFocus)
  }
  public componentDidUpdate(prevProps: IProps) {
    if (
      this.props.active &&
      (!prevProps.active || prevProps.revision !== this.props.revision)
    ) {
      this.refresh()
    } else if (!this.props.active && prevProps.active) {
      this.cancel()
    }
  }
  private cancel = () => {
    this.requests.clear()
    this.queue = []
  }
  private onFocus = () => {
    if (this.props.active) {
      this.refresh()
    }
  }
  private refresh = () => {
    this.cancel()
    this.setState(
      { directories: new Map(), loading: new Set(), errors: new Set() },
      () => this.enqueue('')
    )
  }
  private refreshAll = () => {
    this.refresh()
    this.filenameSearch.current?.refresh()
    this.props.onRefreshPreview()
  }
  private enqueue = (path: string) => {
    if (
      this.requests.has(path) ||
      this.state.directories.has(path) ||
      !this.props.active
    ) {
      return
    }
    const id = ++this.requestID
    this.requests.set(path, id)
    this.queue.push({ path, id })
    this.setState(s => ({ loading: new Set([...s.loading, path]) }))
    this.readNext()
  }
  private enqueueExpanded = () => {
    for (const directory of this.state.directories.values()) {
      for (const entry of directory.entries) {
        if (
          entry.kind === 'directory' &&
          this.state.expanded.has(entry.path) &&
          !this.state.errors.has(entry.path)
        ) {
          this.enqueue(entry.path)
        }
      }
    }
  }
  private readNext = async () => {
    if (this.reading) {
      return
    }
    this.reading = true
    try {
      while (this.mounted && this.props.active && this.queue.length > 0) {
        const job = this.queue.shift()!
        if (this.requests.get(job.path) !== job.id) {
          continue
        }
        try {
          const directory = await readRepositoryDirectory(
            this.props.root,
            job.path
          )
          if (!this.mounted || this.requests.get(job.path) !== job.id) {
            continue
          }
          this.requests.delete(job.path)
          this.setState(s => {
            const used = Array.from(s.directories.values()).reduce(
              (sum, d) => sum + d.entries.length,
              0
            )
            const remaining = Math.max(0, MaxTreeEntries - used)
            const bounded =
              directory.entries.length > remaining
                ? {
                    entries: directory.entries.slice(0, remaining),
                    limited: true,
                  }
                : directory
            const directories = new Map(s.directories).set(job.path, bounded)
            const loading = new Set(s.loading)
            loading.delete(job.path)
            return { directories, loading }
          }, this.enqueueExpanded)
        } catch {
          if (!this.mounted || this.requests.get(job.path) !== job.id) {
            continue
          }
          this.requests.delete(job.path)
          this.setState(s => {
            const loading = new Set(s.loading)
            loading.delete(job.path)
            return { loading, errors: new Set([...s.errors, job.path]) }
          })
        }
      }
    } finally {
      this.reading = false
    }
  }
  private collapse = (path: string) => {
    const inside = (p: string) => p === path || p.startsWith(path + Path.sep)
    for (const p of this.requests.keys()) {
      if (inside(p)) {
        this.requests.delete(p)
      }
    }
    this.setState(s => ({
      expanded: new Set([...s.expanded].filter(p => !inside(p))),
      directories: new Map([...s.directories].filter(([p]) => !inside(p))),
      loading: new Set([...s.loading].filter(p => !inside(p))),
      errors: new Set([...s.errors].filter(p => !inside(p))),
      selected: s.selected !== null && inside(s.selected) ? path : s.selected,
    }))
  }
  private collapseAll = () => {
    this.cancel()
    this.setState(
      s => ({
        expanded: new Set(),
        directories: new Map([...s.directories].filter(([p]) => p === '')),
        loading: new Set(),
        errors: new Set(),
        selected: s.selected?.split(Path.sep)[0] ?? null,
      }),
      () => {
        if (!this.state.directories.has('')) {
          this.enqueue('')
        }
      }
    )
  }
  private toggle = (entry: IRepositoryEntry) => {
    if (entry.kind !== 'directory') {
      this.props.onOpenFile(entry.path)
      return
    }
    if (this.state.expanded.has(entry.path)) {
      this.collapse(entry.path)
    } else {
      this.setState(
        s => ({ expanded: new Set([...s.expanded, entry.path]) }),
        () => this.enqueue(entry.path)
      )
    }
  }
  private revealFile = () => {
    const file = this.props.filePath
    if (file === null) {
      return
    }
    this.filenameSearch.current?.clear()
    const parts = file.split(Path.sep)
    this.setState(
      s => ({
        expanded: new Set([
          ...s.expanded,
          ...parts
            .slice(0, -1)
            .map((_, i) => parts.slice(0, i + 1).join(Path.sep)),
        ]),
        selected: file,
      }),
      () => {
        this.enqueueExpanded()
        this.tree.current?.focus()
      }
    )
  }
  private onSearchingChanged = (searching: boolean) =>
    this.setState({ searching })
  private onRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const row = this.rows(this.state.directories, this.state.expanded)[
      Number(event.currentTarget.dataset.index)
    ]
    this.setState({ selected: row.entry.path })
    this.toggle(row.entry)
    this.tree.current?.focus()
  }
  private onKeyDown = (event: React.KeyboardEvent) => {
    const rows = this.rows(this.state.directories, this.state.expanded)
    const index = Math.max(
      0,
      rows.findIndex(r => r.entry.path === this.state.selected)
    )
    const row = rows[index]
    if (row === undefined) {
      return
    }
    let next = index
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(rows.length - 1, index + 1)
        break
      case 'ArrowUp':
        next = Math.max(0, index - 1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = rows.length - 1
        break
      case 'ArrowRight':
        if (row.entry.kind === 'directory') {
          if (!this.state.expanded.has(row.entry.path)) {
            this.toggle(row.entry)
          } else if (rows[index + 1]?.depth > row.depth) {
            next = index + 1
          }
        }
        break
      case 'ArrowLeft':
        if (
          row.entry.kind === 'directory' &&
          this.state.expanded.has(row.entry.path)
        ) {
          this.collapse(row.entry.path)
        } else {
          const parent = Path.dirname(row.entry.path)
          const parentIndex = rows.findIndex(r => r.entry.path === parent)
          if (parentIndex >= 0) {
            next = parentIndex
          }
        }
        break
      case 'Enter':
      case ' ':
        this.toggle(row.entry)
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    this.setState({ selected: rows[next].entry.path })
  }
  private renderRow = ({ index, key, style }: ListRowProps) => {
    const { entry, depth } = this.rows(
      this.state.directories,
      this.state.expanded
    )[index]
    const folder = entry.kind === 'directory'
    const expanded = this.state.expanded.has(entry.path)
    const directory = this.state.directories.get(entry.path)
    const hint = this.state.loading.has(entry.path)
      ? 'Loading…'
      : this.state.errors.has(entry.path)
      ? 'Cannot read'
      : expanded && directory?.entries.length === 0
      ? directory.limited
        ? 'Limit reached'
        : 'Empty'
      : entry.kind === 'link'
      ? 'Link'
      : null
    return (
      <div
        key={key}
        id={`file-tree-row-${index}`}
        style={style}
        role="treeitem"
        aria-level={depth}
        aria-expanded={folder ? expanded : undefined}
        aria-selected={entry.path === this.state.selected}
        aria-label={`${entry.name}, ${entry.kind}${hint ? `, ${hint}` : ''}`}
        data-index={index}
        data-path={entry.path}
        tabIndex={-1}
        onClick={this.onRowClick}
        onKeyDown={this.onKeyDown}
        className={`repository-tree-row${
          entry.path === this.props.filePath ? ' current-file' : ''
        }`}
      >
        <div style={{ paddingLeft: 10 + (depth - 1) * 14 }}>
          <span className="tree-disclosure">
            {folder && (
              <Octicon symbol={expanded ? chevronDown : chevronRight} />
            )}
          </span>
          <Octicon symbol={folder ? fileDirectory : fileCode} />
          <span className="tree-entry-name">{entry.name}</span>
          {hint !== null && <small>{hint}</small>}
        </div>
      </div>
    )
  }
  public render() {
    const rows = this.rows(this.state.directories, this.state.expanded)
    const selected = rows.findIndex(r => r.entry.path === this.state.selected)
    const limited = [...this.state.directories.values()].some(d => d.limited)
    return (
      <aside className="repository-files-sidebar">
        <div className="files-directory-toolbar">
          <span>{this.props.name}</span>
          <Button
            onClick={this.revealFile}
            disabled={this.props.filePath === null}
            ariaLabel="Reveal current file"
            tooltip={
              this.props.filePath === null
                ? 'No file selected'
                : 'Reveal current file'
            }
          >
            <Octicon symbol={fileCode} />
          </Button>
          <Button
            onClick={this.refreshAll}
            ariaLabel="Refresh files"
            tooltip="Refresh files"
          >
            <Octicon symbol={sync} />
          </Button>
          <Button
            onClick={this.collapseAll}
            disabled={this.state.expanded.size === 0}
            ariaLabel="Collapse all folders"
            tooltip={
              this.state.expanded.size === 0
                ? 'No expanded folders'
                : 'Collapse all folders'
            }
          >
            <Octicon symbol={fold} />
          </Button>
        </div>
        <FilenameSearch
          ref={this.filenameSearch}
          root={this.props.root}
          active={this.props.active}
          revision={this.props.revision}
          onSearchingChanged={this.onSearchingChanged}
          onOpenFile={this.props.onOpenFile}
        />
        {!this.state.searching && (
          <>
            <div
              className="repository-tree"
              ref={this.tree}
              role="tree"
              aria-label="Project files"
              aria-activedescendant={
                selected < 0 ? undefined : `file-tree-row-${selected}`
              }
              tabIndex={0}
              onKeyDown={this.onKeyDown}
            >
              {rows.length === 0 ? (
                <p className="files-list-message" role="status">
                  {this.state.loading.has('')
                    ? 'Opening project…'
                    : this.state.errors.has('')
                    ? 'Could not read this project. Refresh to try again.'
                    : 'This project is empty.'}
                </p>
              ) : (
                <AutoSizer>
                  {({ width, height }) => (
                    <VirtualList
                      width={width}
                      height={height}
                      rowHeight={30}
                      rowCount={rows.length}
                      rowRenderer={this.renderRow}
                      overscanRowCount={8}
                      scrollToIndex={selected < 0 ? undefined : selected}
                      treeState={this.state}
                      currentFile={this.props.filePath}
                    />
                  )}
                </AutoSizer>
              )}
            </div>
            <div className="files-directory-footer" role="status">
              {limited
                ? 'Some folders are limited. Collapse folders or search for a file.'
                : this.state.errors.size > 0
                ? 'A folder could not be read. Collapse and expand it to retry.'
                : 'Working tree · Read only'}
            </div>
          </>
        )}
      </aside>
    )
  }
}
