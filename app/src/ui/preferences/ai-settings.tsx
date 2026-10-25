import * as React from 'react'
import classNames from 'classnames'
import { DialogContent } from '../dialog'
import { Select } from '../lib/select'
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
  getAITimeoutMs,
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

const cloudPresets = AIProviderPresets.filter(
  p => !p.local && p.id !== CustomProviderId
)
const localPresets = AIProviderPresets.filter(p => p.local)

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

    const hasStoredKey =
      !this.preset.local && (await getAIProviderKey(providerId)) !== null
    if (requestId !== this.requestId) {
      return
    }

    this.setState({ hasStoredKey }, () => this.loadModels())
  }

  /** The key to use for requests: the one being typed, else the stored one. */
  private async resolveApiKey(): Promise<string | null> {
    const { apiKey, settings } = this.props
    if (this.preset.local) {
      return null
    }
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
    const needsKey = !this.preset.local && this.preset.id !== CustomProviderId

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
      timeoutMs: getAITimeoutMs(this.preset, this.baseUrl),
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
      <DialogContent className="ai-settings">
        <h2>Commit messages with AI</h2>
        <p className="ai-settings-intro">
          Use your own model to write commit messages. Pick a provider, add its
          API key and choose a model. Keys are stored in your system keychain.
        </p>
        {this.renderProvider()}
        {this.renderBaseUrl()}
        {this.renderApiKey()}
        {this.renderModel()}
        {this.renderTest()}
        {this.props.error !== undefined && (
          <p className="ai-settings-status error" role="alert">
            {this.props.error}
          </p>
        )}
        <p className="settings-description">
          Only the staged diff is sent, straight from this computer to the
          provider. Add a <code>.github/copilot-instructions.md</code> file to a
          repository to steer its commit messages.
        </p>
      </DialogContent>
    )
  }

  private renderProvider() {
    const renderOption = (p: IAIProviderPreset) => (
      <option key={p.id} value={p.id}>
        {p.name}
      </option>
    )

    return (
      <div className="ai-settings-field">
        <Select
          label="Provider"
          value={this.preset.id}
          onChange={this.onProviderChanged}
        >
          <optgroup label="Cloud">{cloudPresets.map(renderOption)}</optgroup>
          <optgroup label="On this computer">
            {localPresets.map(renderOption)}
          </optgroup>
          <optgroup label="Other">
            {renderOption(getAIProviderPreset(CustomProviderId)!)}
          </optgroup>
        </Select>
      </div>
    )
  }

  private renderBaseUrl() {
    const { preset } = this
    if (!preset.editableBaseUrl) {
      return null
    }

    return (
      <div className="ai-settings-field">
        <TextBox
          label="Base URL"
          value={this.props.settings.baseUrl ?? preset.baseUrl}
          placeholder="https://example.com/v1"
          onValueChanged={this.onBaseUrlChanged}
        />
      </div>
    )
  }

  private renderApiKey() {
    const { preset } = this
    if (preset.local) {
      return null
    }

    const placeholder = this.state.hasStoredKey
      ? 'Saved in keychain. Type to replace it.'
      : preset.id === CustomProviderId
      ? 'Optional'
      : 'Paste your API key'

    return (
      <div className="ai-settings-field">
        <div className="ai-settings-field-header">
          <span id="ai-settings-key-label">API key</span>
          {preset.keyUrl !== undefined && (
            <LinkButton uri={preset.keyUrl}>Get an API key</LinkButton>
          )}
        </div>
        <TextBox
          type="password"
          value={this.props.apiKey ?? ''}
          placeholder={placeholder}
          ariaLabelledBy="ai-settings-key-label"
          onValueChanged={this.props.onApiKeyChanged}
        />
        {this.state.hasStoredKey && this.props.apiKey === undefined && (
          <p className="ai-settings-status ok">
            <Octicon symbol={octicons.check} /> A key is saved for {preset.name}
            .
          </p>
        )}
      </div>
    )
  }

  private renderModel() {
    const { models, showModelList, highlightedModel } = this.state
    const matches = this.getMatchingModels()
    const placeholder =
      models.kind === 'loaded'
        ? `Search ${models.models.length} models…`
        : 'Model name, e.g. gpt-4o-mini'

    return (
      <div className="ai-settings-field ai-settings-model">
        <div className="ai-settings-field-header">
          <span id="ai-settings-model-label">Model</span>
          {this.canConnect() && models.kind !== 'loading' && (
            <LinkButton onClick={this.loadModels}>Refresh list</LinkButton>
          )}
        </div>
        <TextBox
          value={this.props.settings.model}
          placeholder={placeholder}
          ariaLabelledBy="ai-settings-model-label"
          ariaControls="ai-settings-model-list"
          onValueChanged={this.onModelChanged}
          onFocus={this.onModelFocus}
          onBlur={this.onModelBlur}
          onKeyDown={this.onModelKeyDown}
        />
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
                className={classNames({ highlighted: i === highlightedModel })}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseDown={() => this.selectModel(m)}
              >
                {m}
              </li>
            ))}
          </ul>
        )}
        {this.renderModelsStatus()}
      </div>
    )
  }

  private renderModelsStatus() {
    const { models } = this.state
    switch (models.kind) {
      case 'idle':
        return this.preset.local || this.canConnect() ? null : (
          <p className="ai-settings-status">
            Add an API key to load the available models.
          </p>
        )
      case 'loading':
        return <p className="ai-settings-status">Loading models…</p>
      case 'loaded':
        return null
      case 'error':
        return (
          <p className="ai-settings-status error">
            Couldn't load models: {withPeriod(models.message)} You can still
            type a model name.
          </p>
        )
    }
  }

  private renderTest() {
    const { test } = this.state
    const canTest =
      this.props.settings.model.trim().length > 0 &&
      this.canConnect() &&
      test.kind !== 'testing'

    return (
      <div className="ai-settings-test">
        <Button onClick={this.onTest} disabled={!canTest}>
          {test.kind === 'testing' ? 'Testing…' : 'Test connection'}
        </Button>
        {test.kind === 'ok' && (
          <span className="ai-settings-status ok">
            <Octicon symbol={octicons.check} /> Works ({test.seconds.toFixed(1)}
            s)
          </span>
        )}
        {test.kind === 'error' && (
          <span className="ai-settings-status error">
            <Octicon symbol={octicons.x} /> {test.message}
          </span>
        )}
      </div>
    )
  }
}
