import * as React from 'react'
import { Account } from '../../models/account'
import { Shell } from '../../lib/shells'
import { ApplicationTheme } from '../lib/application-theme'
import { Avatar } from '../lib/avatar'
import { IAvatarUser } from '../../models/avatar'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { LinkButton } from '../lib/link-button'
import { Switch, SegmentedControl, ISegmentedOption } from '../lib/switch'
import { lookupPreferredEmail } from '../../lib/email'
import { SettingsSection, SettingsRow } from './settings-layout'
import {
  getNotificationSettingsUrl,
  supportsNotifications,
  supportsNotificationsPermissionRequest,
} from 'desktop-notifications'
import {
  getNotificationsPermission,
  requestNotificationsPermission,
} from '../main-process-proxy'

const iconProps = {
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  className: 'segment-icon',
} as const

const ThemeOptions: ReadonlyArray<ISegmentedOption<ApplicationTheme>> = [
  {
    value: ApplicationTheme.Light,
    label: 'Light',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    ),
  },
  {
    value: ApplicationTheme.Dark,
    label: 'Dark',
    icon: (
      <svg {...iconProps}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    ),
  },
  {
    value: ApplicationTheme.System,
    label: 'System',
    icon: (
      <svg {...iconProps}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
]

interface IGeneralSettingsProps {
  readonly accounts: ReadonlyArray<Account>
  readonly account: Account | null
  readonly onSignIn: () => void
  readonly onSignOut: (account: Account) => void

  readonly committerName: string
  readonly committerEmail: string
  readonly isLoadingGitConfig: boolean
  readonly nameError: string | null
  readonly onCommitterNameChanged: (name: string) => void
  readonly onCommitterEmailChanged: (email: string) => void
  /** Called when a commit author field loses focus: time to save it. */
  readonly onCommitterFieldBlur: () => void

  readonly availableEditors: ReadonlyArray<string>
  readonly selectedEditor: string | null
  readonly onEditorChanged: (editor: string) => void
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly onShellChanged: (shell: Shell) => void

  readonly theme: ApplicationTheme
  readonly onThemeChanged: (theme: ApplicationTheme) => void

  readonly notificationsEnabled: boolean
  readonly onNotificationsEnabledChanged: (enabled: boolean) => void
  readonly repositoryIndicatorsEnabled: boolean
  readonly onRepositoryIndicatorsEnabledChanged: (enabled: boolean) => void
}

interface IGeneralSettingsState {
  readonly notificationPermission: 'default' | 'granted' | 'denied' | null
}

/** Account, commit author, apps, theme and background work. */
export class GeneralSettings extends React.Component<
  IGeneralSettingsProps,
  IGeneralSettingsState
> {
  public constructor(props: IGeneralSettingsProps) {
    super(props)
    this.state = { notificationPermission: null }
  }

  public componentDidMount() {
    this.updateNotificationPermission()
  }

  private async updateNotificationPermission() {
    const notificationPermission = await getNotificationsPermission()
    this.setState({ notificationPermission })
  }

  private onGrantNotificationPermission = async () => {
    await requestNotificationsPermission()
    this.updateNotificationPermission()
  }

  private onEditorChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.props.onEditorChanged(event.currentTarget.value)
  }

  private onShellChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.props.onShellChanged(event.currentTarget.value as Shell)
  }

  private onSignOut = () => {
    if (this.props.account !== null) {
      this.props.onSignOut(this.props.account)
    }
  }

  public render() {
    return (
      <div className="settings-page">
        {this.renderAccount()}
        {this.renderAuthor()}
        {this.renderApps()}
        <SettingsSection title="Appearance">
          <SettingsRow label="Theme" labelId="settings-theme-label">
            <SegmentedControl
              ariaLabelledBy="settings-theme-label"
              options={ThemeOptions}
              value={this.props.theme}
              onChange={this.props.onThemeChanged}
            />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="In the background">
          <SettingsRow
            label="Notifications"
            labelId="settings-notifications-label"
            description={this.renderNotificationsDescription()}
          >
            <Switch
              checked={this.props.notificationsEnabled}
              onChange={this.props.onNotificationsEnabledChanged}
              ariaLabelledBy="settings-notifications-label"
            />
          </SettingsRow>
          <SettingsRow
            label="Keep every repository up to date"
            labelId="settings-indicators-label"
            description="Fetches in the background so the repository list shows what to pull and push."
          >
            <Switch
              checked={this.props.repositoryIndicatorsEnabled}
              onChange={this.props.onRepositoryIndicatorsEnabledChanged}
              ariaLabelledBy="settings-indicators-label"
            />
          </SettingsRow>
        </SettingsSection>
      </div>
    )
  }

  private renderAccount() {
    const { account } = this.props

    if (account === null) {
      return (
        <SettingsSection title="Account">
          <SettingsRow
            label="GitHub.com"
            description="Sign in to clone, publish and open pull requests. Local repositories work without an account."
          >
            <Button type="submit" onClick={this.props.onSignIn}>
              Sign In
            </Button>
          </SettingsRow>
        </SettingsSection>
      )
    }

    const avatarUser: IAvatarUser = {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }

    return (
      <SettingsSection title="Account">
        <div className="settings-row settings-account">
          <div className="settings-account-user">
            <Avatar accounts={this.props.accounts} user={avatarUser} />
            <div className="settings-row-text">
              <span>{account.name || `@${account.login}`}</span>
              <p>@{account.login} · GitHub.com</p>
            </div>
          </div>
          <Button onClick={this.onSignOut}>Sign Out</Button>
        </div>
      </SettingsSection>
    )
  }

  private renderAuthor() {
    const disabled = this.props.isLoadingGitConfig
    return (
      <SettingsSection
        title="Commit author"
        footnote="Used for commits in every repository (global Git config)."
      >
        <SettingsRow label="Name" labelId="settings-author-name-label">
          <TextBox
            className="settings-field"
            ariaLabelledBy="settings-author-name-label"
            value={this.props.committerName}
            placeholder="Your Name"
            disabled={disabled}
            onValueChanged={this.props.onCommitterNameChanged}
            onBlur={this.props.onCommitterFieldBlur}
          />
        </SettingsRow>
        {this.props.nameError !== null && (
          <p className="settings-row-error" role="alert">
            {this.props.nameError}
          </p>
        )}
        <SettingsRow label="Email" labelId="settings-author-email-label">
          <TextBox
            className="settings-field"
            ariaLabelledBy="settings-author-email-label"
            type="email"
            value={this.props.committerEmail}
            placeholder="you@example.com"
            disabled={disabled}
            onValueChanged={this.props.onCommitterEmailChanged}
            onBlur={this.props.onCommitterFieldBlur}
          />
        </SettingsRow>
      </SettingsSection>
    )
  }

  private renderApps() {
    const { availableEditors, selectedEditor, availableShells } = this.props
    return (
      <SettingsSection title="Apps">
        <SettingsRow label="Editor" labelFor="settings-editor">
          {availableEditors.length > 0 ? (
            <select
              id="settings-editor"
              className="settings-select"
              value={selectedEditor ?? availableEditors[0]}
              onChange={this.onEditorChanged}
            >
              {availableEditors.map(editor => (
                <option key={editor} value={editor}>
                  {editor}
                </option>
              ))}
            </select>
          ) : (
            <span className="settings-muted">No editors found</span>
          )}
        </SettingsRow>
        <SettingsRow label="Terminal" labelFor="settings-shell">
          <select
            id="settings-shell"
            className="settings-select"
            value={this.props.selectedShell}
            onChange={this.onShellChanged}
          >
            {availableShells.map(shell => (
              <option key={shell} value={shell}>
                {shell}
              </option>
            ))}
          </select>
        </SettingsRow>
      </SettingsSection>
    )
  }

  private renderNotificationsDescription() {
    const base = "Checks and reviews on the current branch's pull request."
    if (!supportsNotifications() || !this.props.notificationsEnabled) {
      return base
    }

    const { notificationPermission } = this.state
    if (
      notificationPermission === 'default' &&
      supportsNotificationsPermissionRequest()
    ) {
      return (
        <>
          {base}{' '}
          <LinkButton onClick={this.onGrantNotificationPermission}>
            Allow notifications
          </LinkButton>
        </>
      )
    }

    const settingsUrl = getNotificationSettingsUrl()
    if (notificationPermission === 'denied' && settingsUrl !== null) {
      return (
        <>
          Notifications are blocked for this app.{' '}
          <LinkButton uri={settingsUrl}>Open System Settings</LinkButton>
        </>
      )
    }

    return base
  }
}
