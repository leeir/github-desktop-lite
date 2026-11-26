import * as React from 'react'
import classNames from 'classnames'

interface ISwitchProps {
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void

  /** Accessible name; usually the visible label next to the switch. */
  readonly ariaLabel?: string
  readonly ariaLabelledBy?: string
  readonly ariaDescribedBy?: string

  readonly disabled?: boolean
  readonly className?: string
}

/** An on/off toggle, for settings that apply immediately. */
export class Switch extends React.Component<ISwitchProps> {
  private onClick = () => {
    if (!this.props.disabled) {
      this.props.onChange(!this.props.checked)
    }
  }

  public render() {
    const { checked, disabled, className } = this.props
    return (
      <button
        type="button"
        role="switch"
        className={classNames('lite-switch', className, { checked })}
        aria-checked={checked}
        aria-label={this.props.ariaLabel}
        aria-labelledby={this.props.ariaLabelledBy}
        aria-describedby={this.props.ariaDescribedBy}
        disabled={disabled}
        onClick={this.onClick}
      >
        <span className="lite-switch-thumb" />
      </button>
    )
  }
}

export interface ISegmentedOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly icon?: JSX.Element
}

interface ISegmentedControlProps<T extends string> {
  readonly options: ReadonlyArray<ISegmentedOption<T>>
  readonly value: T
  readonly onChange: (value: T) => void
  readonly ariaLabel?: string
  readonly ariaLabelledBy?: string
  readonly className?: string
}

/**
 * A row of mutually exclusive choices drawn as one control, with the chosen
 * segment raised. Arrow keys move the choice, like a radio group.
 */
export class SegmentedControl<T extends string> extends React.Component<
  ISegmentedControlProps<T>
> {
  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const { options, value } = this.props
    const index = options.findIndex(o => o.value === value)
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % options.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + options.length) % options.length
    } else {
      return
    }
    event.preventDefault()
    this.props.onChange(options[next].value)
    const buttons = event.currentTarget.parentElement?.querySelectorAll(
      'button[role="radio"]'
    )
    ;(buttons?.[next] as HTMLButtonElement | undefined)?.focus()
  }

  public render() {
    const { options, value } = this.props
    const index = Math.max(
      0,
      options.findIndex(o => o.value === value)
    )
    const indicatorStyle = {
      '--segment-count': options.length,
      '--segment-index': index,
    } as React.CSSProperties

    return (
      <div
        role="radiogroup"
        aria-label={this.props.ariaLabel}
        aria-labelledby={this.props.ariaLabelledBy}
        className={classNames('lite-segmented', this.props.className)}
        style={indicatorStyle}
      >
        <span className="lite-segmented-indicator" aria-hidden="true" />
        {options.map(option => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={classNames('lite-segment', { selected })}
              // eslint-disable-next-line react/jsx-no-bind
              onClick={() => this.props.onChange(option.value)}
              onKeyDown={this.onKeyDown}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
    )
  }
}
