import * as React from 'react'

interface ISettingsSectionProps {
  readonly title: string
  /** A short note under the card. */
  readonly footnote?: string | JSX.Element
}

/** A titled group of settings rows drawn as one card. */
export const SettingsSection: React.FunctionComponent<
  ISettingsSectionProps
> = props => (
  <section className="settings-section">
    <h2>{props.title}</h2>
    <div className="settings-card">{props.children}</div>
    {props.footnote !== undefined && (
      <p className="settings-footnote">{props.footnote}</p>
    )}
  </section>
)

interface ISettingsRowProps {
  readonly label: string

  /** Links the label to a form control by id. */
  readonly labelFor?: string

  /** Id for the label text, for controls labelled with aria-labelledby. */
  readonly labelId?: string

  readonly description?: string | JSX.Element
  readonly descriptionId?: string
}

/** One setting: name and a line of explanation on the left, control right. */
export const SettingsRow: React.FunctionComponent<
  ISettingsRowProps
> = props => {
  const title =
    props.labelFor !== undefined ? (
      <label htmlFor={props.labelFor} id={props.labelId}>
        {props.label}
      </label>
    ) : (
      <span id={props.labelId}>{props.label}</span>
    )

  return (
    <div className="settings-row">
      <div className="settings-row-text">
        {title}
        {props.description !== undefined && (
          <p id={props.descriptionId}>{props.description}</p>
        )}
      </div>
      <div className="settings-row-control">{props.children}</div>
    </div>
  )
}
