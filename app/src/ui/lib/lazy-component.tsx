import * as React from 'react'

interface ILazyState {
  readonly loaded: boolean
}

/**
 * Wrap a dynamically imported React component so webpack splits it into an
 * on-demand chunk while preserving a real DOM node for React 16 + CSSTransition
 * during the ~1-2ms initial module load.
 */
export function createLazyComponent<P extends object>(
  loader: () => Promise<React.ComponentType<P>>
): React.ComponentType<P> {
  let Resolved: React.ComponentType<P> | null = null
  let loadPromise: Promise<React.ComponentType<P>> | null = null

  return class LazyComponent extends React.Component<P, ILazyState> {
    private mounted = false

    public constructor(props: P) {
      super(props)
      this.state = { loaded: Resolved !== null }
    }

    public componentDidMount() {
      this.mounted = true
      if (Resolved !== null) {
        return
      }

      if (loadPromise === null) {
        loadPromise = loader().then(mod => {
          Resolved = mod
          return mod
        })
      }

      loadPromise.then(() => {
        if (this.mounted && !this.state.loaded) {
          this.setState({ loaded: true })
        }
      })
    }

    public componentWillUnmount() {
      this.mounted = false
    }

    public render() {
      if (Resolved !== null) {
        return <Resolved {...this.props} />
      }
      return (
        <div
          className="lazy-component-placeholder"
          style={{ display: 'none' }}
        />
      )
    }
  }
}
