import * as React from 'react'
import { OcticonSymbol, OcticonSymbolVariant } from '.'
import classNames from 'classnames'
import ReactDOM from 'react-dom'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip, TooltipDirection } from '../lib/tooltip'

interface IOcticonProps {
  /**
   * An instance of an object conforming to the OcticonSymbol type. Supports
   * custom paths as well as those provided through the static properties of
   * the OcticonSymbol class.
   */
  readonly symbol: OcticonSymbol

  /**
   * An optional classname that will be appended to the default
   * class name 'octicon'
   */
  readonly className?: string

  /**
   * An optional string to use as a tooltip and aria-label for the icon
   */
  readonly title?: string

  readonly tooltipDirection?: TooltipDirection

  readonly height?: number
}

/**
 * Renders the shared Lucide icon set, preserving legacy Octicon call sites.
 *
 * Note that the aspect ratios of the octicons will always be preserved
 * which is why the width and height properties specify the maximum and
 * not the minimum size.
 *
 * Usage: `<Octicon symbol={octicons.markGithub} />`
 */
export class Octicon extends React.Component<IOcticonProps, {}> {
  private svgRef = createObservableRef<SVGSVGElement>()

  public render() {
    const { symbol } = this.props

    const height = this.props.height ?? 16
    const variant = this.isSingleVariant(symbol)
      ? symbol
      : symbol[
          this.closestNaturalHeight(Object.keys(symbol).map(Number), height)
        ]

    return variant === undefined
      ? null
      : this.renderIcon(variant, this.props.height ?? variant.h)
  }

  private renderIcon(symbol: OcticonSymbolVariant, height: number) {
    const { title, tooltipDirection } = this.props
    // All Lucide artwork uses a 24px grid, independently of its rendered size.
    const viewBox = '0 0 24 24'
    const width = height * (symbol.w / symbol.h)
    const className = classNames(
      'octicon',
      symbol.brand ? 'brand-icon' : 'lucide',
      {
        'icon-filled': symbol.filled,
      },
      this.props.className
    )

    // Hide the octicon from screen readers when it's only being used
    // as a visual without any attached meaning applicable to users
    // consuming the app through an accessibility interface.
    const ariaHidden = title === undefined ? 'true' : undefined

    // Octicons are typically very small so having an explicit direction makes
    // more sense
    const direction = tooltipDirection ?? TooltipDirection.NORTH

    return (
      <svg
        aria-hidden={ariaHidden}
        aria-label={title}
        className={className}
        data-icon={symbol.name}
        fill={symbol.filled ? 'currentColor' : 'none'}
        stroke={symbol.brand ? 'none' : 'currentColor'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        role={title === undefined ? undefined : 'img'}
        version="1.1"
        viewBox={viewBox}
        ref={this.svgRef}
        tabIndex={-1}
        height={height}
        width={width}
      >
        {title !== undefined && (
          <Tooltip
            target={this.svgRef}
            direction={direction}
            applyAriaDescribedBy={false}
          >
            {title}
          </Tooltip>
        )}

        {symbol.nodes.map(([tag, attributes], i) =>
          React.createElement(tag, { ...attributes, key: i })
        )}
      </svg>
    )
  }

  /**
   * Determine if the given symbol is a single variant or a set of variants.
   *
   * @param symbol The symbol to check.
   * @returns      True if the symbol is a single variant, false if it's a set.
   */
  private isSingleVariant(
    symbol: OcticonSymbol
  ): symbol is OcticonSymbolVariant {
    return (
      symbol instanceof Object &&
      symbol.hasOwnProperty('nodes') &&
      symbol.hasOwnProperty('h') &&
      symbol.hasOwnProperty('w')
    )
  }

  /**
   * Find the closest natural height to the given height. Falls back to the
   * first height in the list if none are larger or equal than the given height.
   *
   * @param naturalHeights The list of natural heights to choose from.
   * @param height         The height to find the closest natural height to.
   * @returns              The closest natural height to the given height.
   */
  private closestNaturalHeight(naturalHeights: Array<number>, height: number) {
    return naturalHeights.reduce(
      (acc, naturalHeight) => (naturalHeight <= height ? naturalHeight : acc),
      naturalHeights[0]
    )
  }
}

/**
 * Create an Octicon element for the DOM, wrapped in a div element.
 *
 * @param symbol    OcticonSymbol to render in the element.
 * @param className Optional class to add to the wrapper element.
 * @param id        Optional identifier to set to the wrapper element.
 */
export function createOcticonElement(
  symbol: OcticonSymbol,
  className?: string,
  id?: string
) {
  const wrapper = document.createElement('div')
  wrapper.id = id ?? ''
  if (className !== undefined) {
    wrapper.classList.add(className)
  }
  const octicon = <Octicon symbol={symbol} />
  ReactDOM.render(octicon, wrapper)
  return wrapper
}
