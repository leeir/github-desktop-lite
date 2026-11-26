import * as React from 'react'
import { Spinner } from './spinner'

/** A Loading component. */
export class Loading extends React.Component<{}, {}> {
  public render() {
    return <Spinner className="loading-spinner" />
  }
}
