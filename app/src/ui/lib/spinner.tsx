import * as React from 'react'
import classNames from 'classnames'

/** A small glyph drawn inside the ring, e.g. the direction of a transfer. */
export type SpinnerGlyph = 'up' | 'down'

interface ISpinnerProps {
  /** Rendered size in CSS pixels. Defaults to 16. */
  readonly size?: number

  /**
   * Progress in the range 0..1. When omitted (or 0) the spinner is
   * indeterminate: a breathing arc that rotates around a faint track.
   * When set, the arc settles into a determinate progress ring.
   */
  readonly value?: number

  /** Optional glyph rendered (static) at the center of the ring. */
  readonly glyph?: SpinnerGlyph

  readonly className?: string
}

const GlyphPaths: Record<SpinnerGlyph, string> = {
  up: 'M10 13.4V6.9M7.4 9.4 10 6.8l2.6 2.6',
  down: 'M10 6.6v6.5M7.4 10.6 10 13.2l2.6-2.6',
}

/**
 * The app-wide activity indicator. A ring rather than a rotating icon so that
 * the same element can morph from "working" into real progress without
 * swapping glyphs mid-operation.
 */
export class Spinner extends React.PureComponent<ISpinnerProps> {
  public render() {
    const { size = 16, glyph, className } = this.props
    const value =
      this.props.value !== undefined && Number.isFinite(this.props.value)
        ? Math.max(0, Math.min(1, this.props.value))
        : 0
    const determinate = value > 0
    const arcStyle: React.CSSProperties | undefined = determinate
      ? { strokeDashoffset: 100 - value * 100 }
      : undefined

    return (
      <svg
        className={classNames(
          'lite-spinner',
          determinate ? 'is-determinate' : 'is-indeterminate',
          { 'has-glyph': glyph !== undefined },
          className
        )}
        width={size}
        height={size}
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
      >
        <circle className="lite-spinner-track" cx="10" cy="10" r="8.25" />
        <g className="lite-spinner-rotor">
          <circle
            className="lite-spinner-arc"
            cx="10"
            cy="10"
            r="8.25"
            pathLength={100}
            style={arcStyle}
          />
        </g>
        {glyph !== undefined && (
          <path className="lite-spinner-glyph" d={GlyphPaths[glyph]} />
        )}
      </svg>
    )
  }
}

interface ISpinnerDoneProps {
  readonly size?: number
  readonly className?: string
}

/**
 * The resting state a Spinner hands over to when an operation succeeds:
 * the ring closes and a check mark is drawn into it.
 */
export class SpinnerDone extends React.PureComponent<ISpinnerDoneProps> {
  public render() {
    const { size = 16, className } = this.props
    return (
      <svg
        className={classNames('lite-spinner-done', className)}
        width={size}
        height={size}
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className="lite-spinner-done-ring"
          cx="10"
          cy="10"
          r="8.25"
          pathLength={100}
        />
        <path
          className="lite-spinner-done-check"
          d="M6.6 10.3 8.9 12.6 13.5 7.8"
          pathLength={100}
        />
      </svg>
    )
  }
}
