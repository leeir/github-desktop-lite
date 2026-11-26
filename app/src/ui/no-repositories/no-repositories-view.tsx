import * as React from 'react'
import { UiView } from '../ui-view'
import { Button } from '../lib/button'
import { Octicon, fileDirectory, gitBranch, gear, alert } from '../octicons'

interface INoRepositoriesProps {
  readonly onAdd: (onInvalidPath: (message: string) => void) => Promise<void>
  readonly onShowSettings: () => void
}

/** A single entry point into a local workspace, without account setup. */
export function NoRepositoriesView({
  onAdd,
  onShowSettings,
}: INoRepositoriesProps) {
  const [opening, setOpening] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const pending = React.useRef(false)
  const mounted = React.useRef(true)
  const button = React.useRef<HTMLButtonElement | null>(null)

  React.useEffect(
    () => () => {
      mounted.current = false
    },
    []
  )

  const openRepository = React.useCallback(async () => {
    if (pending.current) {
      return
    }
    pending.current = true
    setError(null)
    setOpening(true)
    try {
      await onAdd(message => {
        if (mounted.current) {
          setError(message)
        }
      })
    } catch (e) {
      log.error('Unable to open the first repository', e)
      if (mounted.current) {
        setError(
          'Unable to open this folder. Check that it is accessible and try again.'
        )
      }
    } finally {
      pending.current = false
      if (mounted.current) {
        setOpening(false)
        button.current?.focus()
      }
    }
  }, [onAdd])

  const setButtonRef = React.useCallback(
    (element: HTMLButtonElement | null) => {
      button.current = element
    },
    []
  )

  return (
    <UiView id="no-repositories">
      <div className="local-start-header">
        <span className="local-start-brand">
          Desktop <span>Lite</span>
        </span>
        <Button className="local-start-settings" onClick={onShowSettings}>
          <Octicon symbol={gear} /> Settings
        </Button>
      </div>
      <section
        className="local-start-content"
        aria-labelledby="local-start-title"
      >
        <div className="local-start-symbol" aria-hidden="true">
          <Octicon symbol={fileDirectory} />
          <span>
            <Octicon symbol={gitBranch} />
          </span>
        </div>
        <span className="local-start-eyebrow">Your local workspace</span>
        <h1 id="local-start-title">Open a local repository</h1>
        <p className="local-start-description">
          Choose a repository folder on your computer.
          <br />
          Your files, branches, and changes will appear here.
        </p>
        <Button
          className="local-start-open"
          onClick={openRepository}
          disabled={opening}
          autoFocus={true}
          onButtonRef={setButtonRef}
        >
          <Octicon symbol={fileDirectory} />
          {opening
            ? 'Opening repository…'
            : error
            ? 'Choose another folder…'
            : 'Open repository…'}
        </Button>
        <div className="local-start-status" role="status">
          {opening
            ? 'Choose a folder in the file picker to continue.'
            : 'Select an existing Git repository. No sign-in required.'}
        </div>
        {error !== null && (
          <div className="local-start-error" role="alert">
            <Octicon symbol={alert} />
            <span>{error}</span>
          </div>
        )}
      </section>
      <footer className="local-start-footer">
        <span>Local first. Ready when you are.</span>
        <span>GitHub accounts can be connected later in Settings.</span>
      </footer>
    </UiView>
  )
}
