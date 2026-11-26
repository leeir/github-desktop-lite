import * as React from 'react'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Switch } from '../lib/switch'
import { SettingsSection, SettingsRow } from './settings-layout'

/** The confirmations shown as switches, in display order. */
export type GitConfirmation =
  | 'discardChanges'
  | 'forcePush'
  | 'undoCommit'
  | 'removeRepository'
  | 'discardStash'
  | 'checkoutCommit'
  | 'commitFilteredChanges'

const Confirmations: ReadonlyArray<{
  readonly id: GitConfirmation
  readonly label: string
  readonly description: string
}> = [
  {
    id: 'discardChanges',
    label: 'Discarding changes',
    description: 'Including changes that are deleted permanently.',
  },
  {
    id: 'forcePush',
    label: 'Force pushing',
    description: 'Rewrites history on the remote branch.',
  },
  {
    id: 'undoCommit',
    label: 'Undoing a commit',
    description: 'Moves the last commit back into your changes.',
  },
  {
    id: 'removeRepository',
    label: 'Removing a repository or worktree',
    description: 'Files on disk are kept unless you choose otherwise.',
  },
  {
    id: 'discardStash',
    label: 'Discarding a stash',
    description: 'Stashed changes cannot be recovered afterwards.',
  },
  {
    id: 'checkoutCommit',
    label: 'Checking out a commit',
    description: 'Leaves you on a detached HEAD.',
  },
  {
    id: 'commitFilteredChanges',
    label: 'Committing changes hidden by a filter',
    description: 'Files you cannot see in the list would be included.',
  },
]

interface IGitSettingsProps {
  readonly defaultBranch: string
  readonly onDefaultBranchChanged: (branch: string) => void
  /** Called when the default branch field loses focus: time to save it. */
  readonly onDefaultBranchBlur: () => void

  readonly confirmations: Readonly<Record<GitConfirmation, boolean>>
  readonly onConfirmationChanged: (id: GitConfirmation, ask: boolean) => void

  readonly loadHookEnvironment: boolean
  readonly onLoadHookEnvironmentChanged: (enabled: boolean) => void
}

/** Default branch, confirmations and Git hooks. */
export class GitSettings extends React.Component<IGitSettingsProps> {
  private onBranchBlur = () => this.props.onDefaultBranchBlur()

  public render() {
    return (
      <div className="settings-page">
        <SettingsSection title="New repositories">
          <SettingsRow
            label="Default branch name"
            labelId="settings-default-branch-label"
            description="Used when you create or initialize a repository."
          >
            <RefNameTextBox
              initialValue={this.props.defaultBranch}
              onValueChange={this.props.onDefaultBranchChanged}
              onBlur={this.onBranchBlur}
              ariaLabelledBy="settings-default-branch-label"
              warningMessageVerb="saved"
              placeholder="main"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Ask before">
          {Confirmations.map(c => (
            <SettingsRow
              key={c.id}
              label={c.label}
              labelId={`settings-confirm-${c.id}`}
              description={c.description}
            >
              <Switch
                checked={this.props.confirmations[c.id]}
                // eslint-disable-next-line react/jsx-no-bind
                onChange={ask => this.props.onConfirmationChanged(c.id, ask)}
                ariaLabelledBy={`settings-confirm-${c.id}`}
              />
            </SettingsRow>
          ))}
        </SettingsSection>

        <SettingsSection title="Hooks">
          <SettingsRow
            label="Load my shell environment for hooks"
            labelId="settings-hook-env-label"
            description="For hooks that need tools from your shell profile, such as nvm or pyenv."
          >
            <Switch
              checked={this.props.loadHookEnvironment}
              onChange={this.props.onLoadHookEnvironmentChanged}
              ariaLabelledBy="settings-hook-env-label"
            />
          </SettingsRow>
        </SettingsSection>
      </div>
    )
  }
}
