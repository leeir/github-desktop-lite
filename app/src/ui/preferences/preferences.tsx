import * as React from 'react'
import { Account, isDotComAccount } from '../../models/account'
import { PreferencesTab } from '../../models/preferences'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogFooter, DialogError } from '../dialog'
import { Button } from '../lib/button'
import {
  getGlobalConfigValue,
  setGlobalConfigValue,
} from '../../lib/git/config'
import { lookupPreferredEmail } from '../../lib/email'
import { Shell, getAvailableShells } from '../../lib/shells'
import { getAvailableEditors } from '../../lib/editors/lookup'
import {
  gitAuthorNameIsValid,
  InvalidGitAuthorNameMessage,
} from '../lib/identifier-rules'
import { ApplicationTheme } from '../lib/application-theme'
import {
  isConfigFileLockError,
  parseConfigLockFilePathFromError,
} from '../../lib/git'
import { ConfigLockFileExists } from '../lib/config-lock-file-exists'
import {
  setDefaultBranch,
  getDefaultBranch,
} from '../../lib/helpers/default-branch'
import { Repository } from '../../models/repository'
import { AISettings } from './ai-settings'
import { GeneralSettings } from './general'
import { GitSettings, GitConfirmation } from './git'
import {
  getAIProviderPreset,
  IAISettings,
  isValidBaseUrl,
} from '../../lib/ai/providers'
import {
  defaultHooksEnvEnabledValue,
  getHooksEnvEnabled,
  setHooksEnvEnabled,
} from '../../lib/hooks/config'

/** What a fresh AI settings form starts with. */
const DefaultAISettings: IAISettings = { providerId: 'openrouter', model: '' }

/** How long AI settings wait after the last edit before they're saved. */
const SaveAISettingsDelayMs = 600

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
  readonly repository: Repository | null
  readonly onDismissed: () => void
  readonly initialSelectedTab?: PreferencesTab
  readonly notificationsEnabled: boolean
  readonly repositoryIndicatorsEnabled: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmWorktreeRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmDiscardChangesPermanently: boolean
  readonly confirmDiscardStash: boolean
  readonly confirmCheckoutCommit: boolean
  readonly confirmForcePush: boolean
  readonly confirmUndoCommit: boolean
  readonly askForConfirmationOnCommitFilteredChanges: boolean
  readonly confirmCommitMessageOverride: boolean
  readonly selectedExternalEditor: string | null
  readonly useCustomEditor: boolean
  readonly selectedShell: Shell
  readonly useCustomShell: boolean
  readonly selectedTheme: ApplicationTheme
  readonly aiSettings: IAISettings | null
}

interface IPreferencesState {
  readonly selectedTab: PreferencesTab

  readonly committerName: string
  readonly committerEmail: string
  /** What's in the global Git config, to know when a field changed. */
  readonly savedCommitterName: string | null
  readonly savedCommitterEmail: string | null
  readonly isLoadingGitConfig: boolean
  readonly nameError: string | null
  /** A Git config lock file that blocked saving, offered for deletion. */
  readonly existingLockFilePath?: string

  readonly defaultBranch: string
  readonly savedDefaultBranch: string | null

  readonly availableEditors: ReadonlyArray<string>
  readonly availableShells: ReadonlyArray<Shell>

  readonly loadHookEnvironment: boolean

  readonly aiSettings: IAISettings
  /** A newly entered API key, or undefined to keep the stored one. */
  readonly aiApiKey: string | undefined
  readonly aiSettingsError?: string
}

interface ITab {
  readonly tab: PreferencesTab
  readonly label: string
  readonly icon: JSX.Element
}

const iconProps = { viewBox: '0 0 24 24', 'aria-hidden': true } as const

const Tabs: ReadonlyArray<ITab> = [
  {
    tab: PreferencesTab.General,
    label: 'General',
    icon: (
      <svg {...iconProps}>
        <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
      </svg>
    ),
  },
  {
    tab: PreferencesTab.AI,
    label: 'AI',
    icon: (
      <svg {...iconProps}>
        <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
        <path d="M20 2v4M22 4h-4" />
        <circle cx="4" cy="20" r="2" />
      </svg>
    ),
  },
  {
    tab: PreferencesTab.Git,
    label: 'Git',
    icon: (
      <svg {...iconProps}>
        <path d="M15 6a9 9 0 0 0-9 9V3" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
      </svg>
    ),
  },
]

/**
 * App settings in three groups. Every change applies right away; text fields
 * save when they lose focus, and anything pending is saved on close.
 */
export class Preferences extends React.Component<
  IPreferencesProps,
  IPreferencesState
> {
  private aiSaveTimer: number | null = null
  /** The last key written to the keychain, so it's only written once. */
  private savedApiKey: string | undefined = undefined

  public constructor(props: IPreferencesProps) {
    super(props)

    this.state = {
      selectedTab: props.initialSelectedTab ?? PreferencesTab.General,
      committerName: '',
      committerEmail: '',
      savedCommitterName: null,
      savedCommitterEmail: null,
      isLoadingGitConfig: true,
      nameError: null,
      defaultBranch: '',
      savedDefaultBranch: null,
      availableEditors: [],
      availableShells: [],
      loadHookEnvironment: getHooksEnvEnabled() ?? defaultHooksEnvEnabledValue,
      aiSettings: props.aiSettings ?? DefaultAISettings,
      aiApiKey: undefined,
    }
  }

  public async componentDidMount() {
    const savedCommitterName = await getGlobalConfigValue('user.name')
    const savedCommitterEmail = await getGlobalConfigValue('user.email')
    const savedDefaultBranch = await getDefaultBranch()

    let committerName = savedCommitterName
    let committerEmail = savedCommitterEmail

    // Suggest the signed-in account's identity when Git has none yet.
    if (!committerName || !committerEmail) {
      const account = this.dotComAccount
      if (account !== null) {
        committerName = committerName || account.login
        committerEmail = committerEmail || lookupPreferredEmail(account)
      }
    }

    const [editors, shells] = await Promise.all([
      getAvailableEditors(),
      getAvailableShells(),
    ])

    this.setState({
      committerName: committerName ?? '',
      committerEmail: committerEmail ?? '',
      savedCommitterName,
      savedCommitterEmail,
      isLoadingGitConfig: false,
      defaultBranch: savedDefaultBranch,
      savedDefaultBranch,
      availableEditors: editors.map(e => e.editor),
      availableShells: shells.map(s => s.shell),
    })
  }

  public componentWillUnmount() {
    this.flushAISettings()
  }

  private get dotComAccount(): Account | null {
    return this.props.accounts.find(isDotComAccount) ?? null
  }

  public render() {
    return (
      <Dialog
        id="preferences"
        title={__DARWIN__ ? 'Settings' : 'Options'}
        onDismissed={this.onClose}
        onSubmit={this.onClose}
        renderHeaderAccessory={this.renderTabs}
      >
        {this.renderLockFileError()}
        <div
          className="settings-body"
          role="tabpanel"
          aria-labelledby={this.getTabId(this.state.selectedTab)}
          key={this.state.selectedTab}
        >
          {this.renderActiveTab()}
        </div>
        <DialogFooter>
          <span className="settings-footer-note">
            Changes apply right away.
          </span>
          <Button type="submit">Done</Button>
        </DialogFooter>
      </Dialog>
    )
  }

  private getTabId(tab: PreferencesTab) {
    return `preferences-tab-${PreferencesTab[tab].toLowerCase()}`
  }

  private renderTabs = () => (
    <div className="settings-tabs" role="tablist" aria-label="Settings">
      {Tabs.map(t => {
        const selected = t.tab === this.state.selectedTab
        return (
          <button
            key={t.tab}
            id={this.getTabId(t.tab)}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? 'settings-tab selected' : 'settings-tab'}
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => this.setState({ selectedTab: t.tab })}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        )
      })}
    </div>
  )

  private renderLockFileError() {
    const { existingLockFilePath } = this.state
    if (existingLockFilePath === undefined) {
      return null
    }

    return (
      <DialogError>
        <ConfigLockFileExists
          lockFilePath={existingLockFilePath}
          onLockFileDeleted={this.onLockFileDeleted}
          onError={this.onLockFileDeleteError}
        />
      </DialogError>
    )
  }

  private renderActiveTab() {
    switch (this.state.selectedTab) {
      case PreferencesTab.General:
        return (
          <GeneralSettings
            accounts={this.props.accounts}
            account={this.dotComAccount}
            onSignIn={this.onSignIn}
            onSignOut={this.onSignOut}
            committerName={this.state.committerName}
            committerEmail={this.state.committerEmail}
            isLoadingGitConfig={this.state.isLoadingGitConfig}
            nameError={this.state.nameError}
            onCommitterNameChanged={this.onCommitterNameChanged}
            onCommitterEmailChanged={this.onCommitterEmailChanged}
            onCommitterFieldBlur={this.saveCommitter}
            availableEditors={this.state.availableEditors}
            selectedEditor={this.props.selectedExternalEditor}
            onEditorChanged={this.onEditorChanged}
            availableShells={this.state.availableShells}
            selectedShell={this.props.selectedShell}
            onShellChanged={this.onShellChanged}
            theme={this.props.selectedTheme}
            onThemeChanged={this.onThemeChanged}
            notificationsEnabled={this.props.notificationsEnabled}
            onNotificationsEnabledChanged={this.onNotificationsEnabledChanged}
            repositoryIndicatorsEnabled={this.props.repositoryIndicatorsEnabled}
            onRepositoryIndicatorsEnabledChanged={
              this.onRepositoryIndicatorsEnabledChanged
            }
          />
        )
      case PreferencesTab.AI:
        return (
          <AISettings
            settings={this.state.aiSettings}
            apiKey={this.state.aiApiKey}
            error={this.state.aiSettingsError}
            onSettingsChanged={this.onAISettingsChanged}
            onApiKeyChanged={this.onAIApiKeyChanged}
            onApiKeyBlur={this.flushAISettings}
            confirmMessageOverride={this.props.confirmCommitMessageOverride}
            onConfirmMessageOverrideChanged={
              this.onConfirmMessageOverrideChanged
            }
          />
        )
      case PreferencesTab.Git:
        return (
          <GitSettings
            defaultBranch={this.state.defaultBranch}
            onDefaultBranchChanged={this.onDefaultBranchChanged}
            onDefaultBranchBlur={this.saveDefaultBranch}
            confirmations={this.getConfirmations()}
            onConfirmationChanged={this.onConfirmationChanged}
            loadHookEnvironment={this.state.loadHookEnvironment}
            onLoadHookEnvironmentChanged={this.onLoadHookEnvironmentChanged}
          />
        )
    }
  }

  private onClose = async () => {
    await Promise.all([
      this.saveCommitter(),
      this.saveDefaultBranch(),
      this.flushAISettings(),
    ])
    this.props.onDismissed()
  }

  private onSignIn = () => {
    this.props.onDismissed()
    this.props.dispatcher.showDotComSignInDialog()
  }

  private onSignOut = (account: Account) => {
    this.props.dispatcher.removeAccount(account)
  }

  private onThemeChanged = (theme: ApplicationTheme) => {
    this.props.dispatcher.setSelectedTheme(theme)
  }

  private onNotificationsEnabledChanged = (enabled: boolean) => {
    this.props.dispatcher.setNotificationsEnabled(enabled)
  }

  private onRepositoryIndicatorsEnabledChanged = (enabled: boolean) => {
    this.props.dispatcher.setRepositoryIndicatorsEnabled(enabled)
  }

  private onConfirmMessageOverrideChanged = (ask: boolean) => {
    this.props.dispatcher.setConfirmCommitMessageOverrideSetting(ask)
  }

  private onEditorChanged = (editor: string) => {
    const { dispatcher } = this.props
    // Custom integrations are gone: picking an editor replaces one.
    if (this.props.useCustomEditor) {
      dispatcher.setUseCustomEditor(false)
    }
    dispatcher.setExternalEditor(editor)
  }

  private onShellChanged = (shell: Shell) => {
    const { dispatcher } = this.props
    if (this.props.useCustomShell) {
      dispatcher.setUseCustomShell(false)
    }
    dispatcher.setShell(shell)
  }

  // ----- Commit author ----------------------------------------------------

  private onCommitterNameChanged = (committerName: string) => {
    this.setState({
      committerName,
      nameError: gitAuthorNameIsValid(committerName)
        ? null
        : InvalidGitAuthorNameMessage,
    })
  }

  private onCommitterEmailChanged = (committerEmail: string) => {
    this.setState({ committerEmail })
  }

  private saveCommitter = async () => {
    const {
      committerName,
      committerEmail,
      savedCommitterName,
      savedCommitterEmail,
      isLoadingGitConfig,
      nameError,
    } = this.state

    if (isLoadingGitConfig || nameError !== null) {
      return
    }

    const nameChanged =
      committerName.trim() !== '' && committerName !== savedCommitterName
    const emailChanged =
      committerEmail.trim() !== '' && committerEmail !== savedCommitterEmail
    if (!nameChanged && !emailChanged) {
      return
    }

    try {
      if (nameChanged) {
        await setGlobalConfigValue('user.name', committerName)
      }
      if (emailChanged) {
        await setGlobalConfigValue('user.email', committerEmail)
      }
      this.setState({
        savedCommitterName: committerName,
        savedCommitterEmail: committerEmail,
      })
      if (this.props.repository !== null) {
        this.props.dispatcher.refreshAuthor(this.props.repository)
      }
    } catch (e) {
      this.handleGitConfigError(e)
    }
  }

  private handleGitConfigError(e: unknown) {
    if (!(e instanceof Error)) {
      return
    }
    if (isConfigFileLockError(e)) {
      const lockFilePath = parseConfigLockFilePathFromError(e.result)
      if (lockFilePath !== null) {
        this.setState({ existingLockFilePath: lockFilePath })
        return
      }
    }
    this.props.dispatcher.postError(e)
  }

  private onLockFileDeleted = () => {
    this.setState({ existingLockFilePath: undefined }, () =>
      this.saveCommitter()
    )
  }

  private onLockFileDeleteError = (e: Error) => {
    this.props.dispatcher.postError(e)
  }

  // ----- Git --------------------------------------------------------------

  private onDefaultBranchChanged = (defaultBranch: string) => {
    this.setState({ defaultBranch })
  }

  private saveDefaultBranch = async () => {
    const { defaultBranch, savedDefaultBranch } = this.state
    // An empty name keeps the previous one rather than unsetting it.
    if (defaultBranch.length === 0 || defaultBranch === savedDefaultBranch) {
      return
    }

    try {
      await setDefaultBranch(defaultBranch)
      this.setState({ savedDefaultBranch: defaultBranch })
    } catch (e) {
      this.handleGitConfigError(e)
    }
  }

  private getConfirmations(): Record<GitConfirmation, boolean> {
    const p = this.props
    return {
      // Merged pairs read as on when either half still asks.
      discardChanges:
        p.confirmDiscardChanges || p.confirmDiscardChangesPermanently,
      forcePush: p.confirmForcePush,
      undoCommit: p.confirmUndoCommit,
      removeRepository: p.confirmRepositoryRemoval || p.confirmWorktreeRemoval,
      discardStash: p.confirmDiscardStash,
      checkoutCommit: p.confirmCheckoutCommit,
      commitFilteredChanges: p.askForConfirmationOnCommitFilteredChanges,
    }
  }

  private onConfirmationChanged = (id: GitConfirmation, ask: boolean) => {
    const { dispatcher } = this.props
    switch (id) {
      case 'discardChanges':
        dispatcher.setConfirmDiscardChangesSetting(ask)
        dispatcher.setConfirmDiscardChangesPermanentlySetting(ask)
        break
      case 'forcePush':
        dispatcher.setConfirmForcePushSetting(ask)
        break
      case 'undoCommit':
        dispatcher.setConfirmUndoCommitSetting(ask)
        break
      case 'removeRepository':
        dispatcher.setConfirmRepoRemovalSetting(ask)
        dispatcher.setConfirmWorktreeRemovalSetting(ask)
        break
      case 'discardStash':
        dispatcher.setConfirmDiscardStashSetting(ask)
        break
      case 'checkoutCommit':
        dispatcher.setConfirmCheckoutCommitSetting(ask)
        break
      case 'commitFilteredChanges':
        dispatcher.setConfirmCommitFilteredChanges(ask)
        break
    }
  }

  private onLoadHookEnvironmentChanged = (loadHookEnvironment: boolean) => {
    setHooksEnvEnabled(loadHookEnvironment)
    this.setState({ loadHookEnvironment })
  }

  // ----- AI ---------------------------------------------------------------

  private onAISettingsChanged = (aiSettings: IAISettings) => {
    this.setState(
      state => ({
        aiSettings,
        aiSettingsError: undefined,
        // Each provider has its own key; a key typed for another one is moot.
        aiApiKey:
          state.aiSettings.providerId === aiSettings.providerId
            ? state.aiApiKey
            : undefined,
      }),
      this.scheduleAISave
    )
  }

  private onAIApiKeyChanged = (aiApiKey: string) => {
    this.setState({ aiApiKey })
  }

  private scheduleAISave = () => {
    this.clearAISaveTimer()
    this.aiSaveTimer = window.setTimeout(
      this.flushAISettings,
      SaveAISettingsDelayMs
    )
  }

  private clearAISaveTimer() {
    if (this.aiSaveTimer !== null) {
      window.clearTimeout(this.aiSaveTimer)
      this.aiSaveTimer = null
    }
  }

  /** Returns a message describing what's wrong with the AI settings, if any. */
  private validateAISettings(): string | undefined {
    const { aiSettings } = this.state
    const preset = getAIProviderPreset(aiSettings.providerId)
    const baseUrl = aiSettings.baseUrl?.trim() ?? ''
    if (preset?.editableBaseUrl && baseUrl !== '' && !isValidBaseUrl(baseUrl)) {
      return 'Enter an HTTPS URL for a hosted model provider.'
    }
    return undefined
  }

  private flushAISettings = async () => {
    this.clearAISaveTimer()

    const error = this.validateAISettings()
    if (error !== undefined) {
      this.setState({ aiSettingsError: error })
      return
    }

    const { aiSettings, aiApiKey } = this.state
    const saved = this.props.aiSettings
    const typedKey = aiApiKey?.trim()
    const newKey = typedKey !== this.savedApiKey ? typedKey : undefined

    // Nothing configured yet and nothing typed: keep AI unset.
    if (saved === null && aiSettings.model === '' && newKey === undefined) {
      return
    }

    const unchanged =
      saved !== null &&
      newKey === undefined &&
      saved.providerId === aiSettings.providerId &&
      saved.model === aiSettings.model.trim() &&
      (saved.baseUrl ?? '') === (aiSettings.baseUrl ?? '')

    if (!unchanged) {
      await this.props.dispatcher.setAISettings(
        { ...aiSettings, model: aiSettings.model.trim() },
        newKey
      )
      if (newKey !== undefined) {
        this.savedApiKey = newKey
      }
    }
  }
}
