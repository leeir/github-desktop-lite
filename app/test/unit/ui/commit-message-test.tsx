import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Account } from '../../../src/models/account'
import { DefaultCommitMessage } from '../../../src/models/commit-message'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepoRulesInfo } from '../../../src/models/repo-rules'
import { Repository } from '../../../src/models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import { CommitMessage } from '../../../src/ui/changes/commit-message'

type CommitMessageProps = React.ComponentProps<typeof CommitMessage>
type AIButtonProps = {
  readonly ariaLabel?: string
  readonly disabled?: boolean
}

type CommitMessageTestInstance = {
  readonly renderAIButton: () => React.ReactElement | null
  readonly onAIButtonClick: (
    event: Pick<React.MouseEvent<HTMLButtonElement>, 'preventDefault'>
  ) => Promise<void>
}

function createAccount() {
  return new Account(
    'mona',
    'https://api.github.com',
    'token',
    [],
    '',
    1,
    'Mona Lisa',
    'free'
  )
}

function createRepository() {
  const owner = new Owner('octocat', 'https://api.github.com', 1)
  const gitHubRepository = new GitHubRepository(
    'desktop',
    owner,
    99,
    false,
    'https://github.com/octocat/desktop'
  )

  return new Repository('/tmp/desktop-fixture', 123, gitHubRepository, false)
}

function createSelectedFile(path: string) {
  return new WorkingDirectoryFileChange(
    path,
    { kind: AppFileStatusKind.Modified },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

function createProps(
  overrides: Partial<CommitMessageProps> = {}
): CommitMessageProps {
  const account = createAccount()
  const repository = createRepository()
  const filesSelected = [createSelectedFile('src/index.ts')]

  return {
    onCreateCommit: async () => false,
    branch: 'main',
    commitAuthor: null,
    anyFilesSelected: true,
    filesToBeCommittedCount: filesSelected.length,
    showPromptForCommittingFileHiddenByFilter: false,
    isShowingModal: false,
    isShowingFoldout: false,
    anyFilesAvailable: true,
    filesSelected,
    focusCommitMessage: false,
    commitMessage: DefaultCommitMessage,
    repository,
    repositoryAccount: null,
    autocompletionProviders: [],
    isCommitting: false,
    hookProgress: null,
    onShowCommitProgress: undefined,
    isGeneratingCommitMessage: true,
    shouldShowGenerateCommitMessageCallOut: false,
    commitToAmend: null,
    placeholder: 'Summary',
    prepopulateCommitSummary: false,
    showBranchProtected: false,
    repoRulesInfo: new RepoRulesInfo(),
    aheadBehind: null,
    showNoWriteAccess: false,
    showCoAuthoredBy: false,
    showInputLabels: false,
    coAuthors: [],
    commitSpellcheckEnabled: false,
    showCommitLengthWarning: false,
    mostRecentLocalCommit: null,
    onCoAuthorsUpdated: () => {},
    onShowCoAuthoredByChanged: () => {},
    onConfirmCommitWithUnknownCoAuthors: () => {},
    onGenerateCommitMessage: () => {},
    onCancelGenerateCommitMessage: () => {},
    onCommitMessageFocusSet: () => {},
    onRefreshAuthor: () => {},
    onShowPopup: () => {},
    onShowFoldout: () => {},
    onCommitSpellcheckEnabledChanged: () => {},
    onStopAmending: () => {},
    onShowCreateForkDialog: () => {},
    accounts: [account],
    skipCommitHooks: false,
    signOffCommits: false,
    allowEmptyCommit: false,
    showAllowEmptyCommitOption: true,
    onUpdateCommitOptions: () => {},
    ...overrides,
  }
}

function toTestInstance(component: CommitMessage): CommitMessageTestInstance {
  return component as unknown as CommitMessageTestInstance
}

function isElementWithAIButtonProps(
  node: React.ReactNode
): node is React.ReactElement<AIButtonProps & { readonly className?: string }> {
  return React.isValidElement(node) && node.props.className === 'ai-button'
}

function getAIButtonProps(component: CommitMessageTestInstance): AIButtonProps {
  const button = component.renderAIButton()
  if (button === null) {
    throw new Error('Expected AI button to render')
  }

  const buttonElement = React.Children.toArray(button.props.children).find(
    isElementWithAIButtonProps
  )
  if (buttonElement === undefined) {
    throw new Error('Expected AI button element to render')
  }

  return buttonElement.props
}

async function clickAIButton(component: CommitMessageTestInstance) {
  await component.onAIButtonClick({
    preventDefault: () => {},
  })
}

describe('CommitMessage', () => {
  it('does not allow cancelling commit message generation without a cancel handler', async () => {
    const component = toTestInstance(
      new CommitMessage(
        createProps({ onCancelGenerateCommitMessage: undefined })
      )
    )

    const buttonProps = getAIButtonProps(component)

    assert.equal(buttonProps.ariaLabel, 'Generating commit details…')
    assert.equal(buttonProps.disabled, true)
  })

  it('allows cancelling commit message generation', async () => {
    let cancelCount = 0
    const component = toTestInstance(
      new CommitMessage(
        createProps({
          onCancelGenerateCommitMessage: () => {
            cancelCount++
          },
        })
      )
    )

    const buttonProps = getAIButtonProps(component)

    assert.equal(buttonProps.ariaLabel, 'Cancel generating commit details')
    assert.equal(buttonProps.disabled, false)

    await clickAIButton(component)

    assert.equal(cancelCount, 1)
  })
})
