import * as React from 'react'
import classNames from 'classnames'
import { Switch } from '../lib/switch'
import { SettingsSection, SettingsRow } from './settings-layout'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { aiComplete, aiListModels } from '../main-process-proxy'
import {
  AIProviderPresets,
  CustomProviderId,
  getAIConnection,
  getAIProviderKey,
  getAIProviderPreset,
  AITimeoutMs,
  getEffectiveBaseUrl,
  IAIProviderPreset,
  IAISettings,
  isValidBaseUrl,
} from '../../lib/ai/providers'

interface IAISettingsProps {
  readonly settings: IAISettings
  /** A newly entered API key, or undefined to keep the stored one. */
  readonly apiKey: string | undefined
  readonly error?: string
  readonly onSettingsChanged: (settings: IAISettings) => void
  readonly onApiKeyChanged: (apiKey: string) => void
  /** Called when the API key field loses focus: time to save it. */
  readonly onApiKeyBlur: () => void

  /** Ask before a draft replaces a message the user already typed. */
  readonly confirmMessageOverride: boolean
  readonly onConfirmMessageOverrideChanged: (ask: boolean) => void
}

type ModelsState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly models: ReadonlyArray<string> }
  | { readonly kind: 'error'; readonly message: string }

type TestState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'testing' }
  | { readonly kind: 'ok'; readonly seconds: number }
  | { readonly kind: 'error'; readonly message: string }

interface IAISettingsState {
  /** Whether the keychain holds a key for the selected provider. */
  readonly hasStoredKey: boolean
  readonly models: ModelsState
  readonly test: TestState
  readonly showModelList: boolean
  readonly highlightedModel: number
}

/** How long to wait after typing before (re)loading the model list. */
const ReloadModelsDelayMs = 600
const MaxListedModels = 200

const cloudPresets = AIProviderPresets.filter(p => p.id !== CustomProviderId)

/** Provider messages don't always end in punctuation. */
function withPeriod(message: string) {
  return /[.!?]$/.test(message.trim()) ? message.trim() : `${message.trim()}.`
}

/** Case-insensitive match where every space-separated term must appear. */
function filterModels(models: ReadonlyArray<string>, query: string) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 0)
  return terms.length === 0
    ? models
    : models.filter(m => {
        const id = m.toLowerCase()
        return terms.every(t => id.includes(t))
      })
}

/**
 * Settings for commit message generation: pick a provider, paste its API
 * key, pick a model. The model list is fetched from the provider as soon as
 * it can be.
 */
export class AISettings extends React.Component<
  IAISettingsProps,
  IAISettingsState
> {
  private reloadTimer: number | null = null
  /** Incremented per request so that stale responses are ignored. */
  private requestId = 0

  public constructor(props: IAISettingsProps) {
    super(props)
    this.state = {
      hasStoredKey: false,
      models: { kind: 'idle' },
      test: { kind: 'idle' },
      showModelList: false,
      highlightedModel: 0,
    }
  }

  public componentDidMount() {
    this.onProviderSelected()
  }

  public componentDidUpdate(prevProps: IAISettingsProps) {
    const { settings, apiKey } = this.props

    if (prevProps.settings.providerId !== settings.providerId) {
      this.onProviderSelected()
    } else if (
      prevProps.apiKey !== apiKey ||
      prevProps.settings.baseUrl !== settings.baseUrl
    ) {
      this.scheduleModelReload()
    }
  }

  public componentWillUnmount() {
    this.clearReloadTimer()
    this.requestId++
  }

  private get preset(): IAIProviderPreset {
    return (
      getAIProviderPreset(this.props.settings.providerId) ?? cloudPresets[0]
    )
  }

  private get baseUrl() {
    return getEffectiveBaseUrl(this.preset, this.props.settings.baseUrl)
  }

  private clearReloadTimer() {
    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer)
      this.reloadTimer = null
    }
  }

  private scheduleModelReload() {
    this.clearReloadTimer()
    this.setState({ test: { kind: 'idle' } })
    this.reloadTimer = window.setTimeout(() => {
      this.reloadTimer = null
      this.loadModels()
    }, ReloadModelsDelayMs)
  }

  private async onProviderSelected() {
    const requestId = ++this.requestId
    const { providerId } = this.props.settings
    this.setState({ models: { kind: 'idle' }, test: { kind: 'idle' } })

    const hasStoredKey = (await getAIProviderKey(providerId)) !== null
    if (requestId !== this.requestId) {
      return
    }

    this.setState({ hasStoredKey }, () => this.loadModels())
  }

  /** The key to use for requests: the one being typed, else the stored one. */
  private async resolveApiKey(): Promise<string | null> {
    const { apiKey, settings } = this.props
    if (apiKey !== undefined) {
      return apiKey.trim() || null
    }
    return this.state.hasStoredKey
      ? getAIProviderKey(settings.providerId)
      : null
  }

  /** Whether we have enough information to talk to the provider. */
  private canConnect() {
    const { apiKey } = this.props
    const hasKey =
      apiKey !== undefined ? apiKey.trim().length > 0 : this.state.hasStoredKey
    const needsKey = this.preset.id !== CustomProviderId

    return isValidBaseUrl(this.baseUrl) && (hasKey || !needsKey)
  }

  private loadModels = async () => {
    const requestId = ++this.requestId
    if (!this.canConnect()) {
      this.setState({ models: { kind: 'idle' } })
      return
    }

    this.setState({ models: { kind: 'loading' } })
    const apiKey = await this.resolveApiKey()
    const result = await aiListModels(
      getAIConnection(this.preset, this.props.settings.baseUrl, apiKey)
    )
    if (requestId !== this.requestId) {
      return
    }

    this.setState({
      models:
        result.kind === 'ok'
          ? { kind: 'loaded', models: result.models }
          : { kind: 'error', message: result.message },
    })
  }

  private onTest = async () => {
    const { settings } = this.props
    this.setState({ test: { kind: 'testing' } })

    const started = Date.now()
    const result = await aiComplete({
      id: crypto.randomUUID(),
      connection: getAIConnection(
        this.preset,
        settings.baseUrl,
        await this.resolveApiKey()
      ),
      model: settings.model.trim(),
      systemPrompt: 'This is a connectivity check. Reply with the word OK.',
      userPrompt: 'ping',
      timeoutMs: AITimeoutMs,
    })

    this.setState({
      test:
        result.kind === 'ok'
          ? { kind: 'ok', seconds: (Date.now() - started) / 1000 }
          : {
              kind: 'error',
              message: result.kind === 'error' ? result.message : 'Cancelled.',
            },
    })
  }

  private onProviderChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.props.onSettingsChanged({
      providerId: event.currentTarget.value,
      model: '',
    })
  }

  private onBaseUrlChanged = (baseUrl: string) => {
    this.props.onSettingsChanged({ ...this.props.settings, baseUrl })
  }

  private onModelChanged = (model: string) => {
    this.setState({
      showModelList: true,
      highlightedModel: 0,
      test: { kind: 'idle' },
    })
    this.props.onSettingsChanged({ ...this.props.settings, model })
  }

  private selectModel(model: string) {
    this.setState({ showModelList: false, test: { kind: 'idle' } })
    this.props.onSettingsChanged({ ...this.props.settings, model })
  }

  private onModelFocus = () => this.setState({ showModelList: true })

  // Delay hiding so a click on a list item still lands.
  private onModelBlur = () =>
    window.setTimeout(() => this.setState({ showModelList: false }), 150)

  private onModelKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const matches = this.getMatchingModels()
    const { highlightedModel, showModelList } = this.state

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const count = Math.max(matches.length, 1)
      this.setState({
        showModelList: true,
        highlightedModel: (highlightedModel + delta + count) % count,
      })
    } else if (event.key === 'Enter' && showModelList && matches.length > 0) {
      event.preventDefault()
      this.selectModel(matches[highlightedModel] ?? matches[0])
    } else if (event.key === 'Escape' && showModelList) {
      event.preventDefault()
      event.stopPropagation()
      this.setState({ showModelList: false })
    }
  }

  private getMatchingModels(): ReadonlyArray<string> {
    const { models } = this.state
    if (models.kind !== 'loaded') {
      return []
    }

    const { model } = this.props.settings
    // Show everything once a listed model is picked, so it's easy to switch.
    const query = models.models.includes(model) ? '' : model
    return filterModels(models.models, query).slice(0, MaxListedModels)
  }

  public render() {
    return (
      <div className="settings-page ai-settings">
        <SettingsSection
          title="Model"
          footnote={
            <>
              Only the staged diff is sent, straight from this Mac to the
              provider. Keys stay in your keychain. Add a{' '}
              <code>.github/commit-instructions.md</code> file to a repository
              to steer its commit messages.
            </>
          }
        >
          {this.renderProvider()}
          {this.renderBaseUrl()}
          {this.renderApiKey()}
          {this.renderModel()}
          {this.renderTest()}
        </SettingsSection>
        {this.props.error !== undefined && (
          <p className="settings-row-error" role="alert">
            {this.props.error}
          </p>
        )}
        <SettingsSection title="Drafting">
          <SettingsRow
            label="Ask before replacing my message"
            labelId="settings-ai-override-label"
            description="When a draft would overwrite text you already typed."
          >
            <Switch
              checked={this.props.confirmMessageOverride}
              onChange={this.props.onConfirmMessageOverrideChanged}
              ariaLabelledBy="settings-ai-override-label"
            />
          </SettingsRow>
        </SettingsSection>
      </div>
    )
  }

  private renderProvider() {
    const renderOption = (p: IAIProviderPreset) => (
      <option key={p.id} value={p.id}>
        {p.name}
      </option>
    )

    return (
      <SettingsRow label="Provider" labelFor="settings-ai-provider">
        <select
          id="settings-ai-provider"
          className="settings-select"
          value={this.preset.id}
          onChange={this.onProviderChanged}
        >
          {cloudPresets.map(renderOption)}
          <option disabled={true}>──────────</option>
          {renderOption(getAIProviderPreset(CustomProviderId)!)}
        </select>
      </SettingsRow>
    )
  }

  private renderBaseUrl() {
    const { preset } = this
    if (!preset.editableBaseUrl) {
      return null
    }

    return (
      <SettingsRow
        label="Base URL"
        labelId="settings-ai-base-url-label"
        description="An OpenAI-compatible endpoint over HTTPS."
      >
        <TextBox
          className="settings-field"
          ariaLabelledBy="settings-ai-base-url-label"
          value={this.props.settings.baseUrl ?? preset.baseUrl}
          placeholder="https://example.com/v1"
          onValueChanged={this.onBaseUrlChanged}
        />
      </SettingsRow>
    )
  }

  private renderApiKey() {
    const { preset } = this
    const placeholder = this.state.hasStoredKey
      ? 'Saved — type to replace'
      : preset.id === CustomProviderId
      ? 'Optional'
      : 'Paste your API key'

    const description =
      preset.keyUrl !== undefined ? (
        <LinkButton uri={preset.keyUrl}>Get an API key</LinkButton>
      ) : undefined

    return (
      <SettingsRow
        label="API key"
        labelId="settings-ai-key-label"
        description={description}
      >
        <TextBox
          className="settings-field"
          ariaLabelledBy="settings-ai-key-label"
          type="password"
          value={this.props.apiKey ?? ''}
          placeholder={placeholder}
          onValueChanged={this.props.onApiKeyChanged}
          onBlur={this.props.onApiKeyBlur}
        />
      </SettingsRow>
    )
  }

  private renderModel() {
    const { models, showModelList, highlightedModel } = this.state
    const matches = this.getMatchingModels()
    const placeholder =
      models.kind === 'loaded'
        ? `Search ${models.models.length} models…`
        : 'e.g. gpt-4.1-mini'

    return (
      <SettingsRow
        label="Model"
        labelId="settings-ai-model-label"
        description={this.renderModelsStatus() ?? undefined}
      >
        <div className="ai-settings-model">
          <TextBox
            className="settings-field"
            ariaLabelledBy="settings-ai-model-label"
            value={this.props.settings.model}
            placeholder={placeholder}
            ariaControls="ai-settings-model-list"
            onValueChanged={this.onModelChanged}
            onFocus={this.onModelFocus}
            onBlur={this.onModelBlur}
            onKeyDown={this.onModelKeyDown}
          />
          <Button
            className="settings-icon-button"
            onClick={this.loadModels}
            disabled={!this.canConnect() || models.kind === 'loading'}
            ariaLabel="Refresh model list"
            tooltip="Refresh model list"
          >
            <Octicon
              symbol={octicons.sync}
              className={models.kind === 'loading' ? 'spin' : undefined}
            />
          </Button>
          {showModelList && matches.length > 0 && (
            <ul
              id="ai-settings-model-list"
              className="ai-settings-model-list"
              role="listbox"
            >
              {matches.map((m, i) => (
                <li
                  key={m}
                  role="option"
                  aria-selected={i === highlightedModel}
                  className={classNames({
                    highlighted: i === highlightedModel,
                  })}
                  // eslint-disable-next-line react/jsx-no-bind
                  onMouseDown={() => this.selectModel(m)}
                >
                  {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsRow>
    )
  }

  private renderModelsStatus() {
    const { models } = this.state
    switch (models.kind) {
      case 'idle':
        return this.canConnect()
          ? null
          : 'Add an API key to load the available models.'
      case 'loading':
        return 'Loading models…'
      case 'loaded':
        return null
      case 'error':
        return (
          <span className="ai-settings-status error">
            Couldn't load models: {withPeriod(models.message)} You can still
            type a model name.
          </span>
        )
    }
  }

  private renderTest() {
    const { test } = this.state
    const canTest =
      this.props.settings.model.trim().length > 0 &&
      this.canConnect() &&
      test.kind !== 'testing'

    const status =
      test.kind === 'ok' ? (
        <span className="ai-settings-status ok">
          <Octicon symbol={octicons.check} /> Connected — replied in{' '}
          {test.seconds.toFixed(1)} s
        </span>
      ) : test.kind === 'error' ? (
        <span className="ai-settings-status error">
          <Octicon symbol={octicons.x} /> {test.message}
        </span>
      ) : test.kind === 'testing' ? (
        'Sending a test request…'
      ) : (
        'Check that the key and model work.'
      )

    return (
      <SettingsRow label="Connection" description={status}>
        <Button onClick={this.onTest} disabled={!canTest}>
          {test.kind === 'testing' ? 'Testing…' : 'Test Connection'}
        </Button>
      </SettingsRow>
    )
  }
}
