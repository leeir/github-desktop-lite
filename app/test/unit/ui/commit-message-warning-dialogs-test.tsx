import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import { GenerateCommitMessageOverrideWarning } from '../../../src/ui/generate-commit-message/generate-commit-message-override-warning'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const originalEvent = globalThis.Event
let restoreIpcSend: (() => void) | null = null
const fixtureRepositoryPath = '/tmp/desktop-fixture'

class TestDispatcher {
  public disclaimerSeenCount = 0
  public confirmOverrideValues = new Array<boolean>()
  public generated = new Array<{
    readonly repository: Repository
    readonly filesSelected: ReadonlyArray<WorkingDirectoryFileChange>
  }>()

  public updateCommitMessageGenerationDisclaimerLastSeen() {
    this.disclaimerSeenCount++
  }

  public generateCommitMessage(
    repository: Repository,
    filesSelected: ReadonlyArray<WorkingDirectoryFileChange>
  ) {
    this.generated.push({ repository, filesSelected })
  }

  public async setConfirmCommitMessageOverrideSetting(value: boolean) {
    this.confirmOverrideValues.push(value)
  }
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

  return new Repository(fixtureRepositoryPath, 123, gitHubRepository, false)
}

function createSelectedFile(path: string) {
  return new WorkingDirectoryFileChange(
    path,
    { kind: AppFileStatusKind.Modified },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

function toDispatcher(dispatcher: TestDispatcher): Dispatcher {
  return dispatcher as unknown as Dispatcher
}

async function stubIpcSend() {
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  restoreIpcSend = () => {
    electron.ipcRenderer.send = previousSend
    restoreIpcSend = null
  }
}

function assertAnnouncementIncludes(dialog: Element, expectedId: string) {
  const announcement = `${dialog.getAttribute('aria-labelledby') ?? ''} ${
    dialog.getAttribute('aria-describedby') ?? ''
  }`

  assert.ok(announcement.includes(expectedId))
}

afterEach(() => {
  globalThis.Event = originalEvent
  restoreIpcSend?.()
})

describe('commit message warning dialogs', () => {
  it('renders the override warning and persists the opt-out choice on submit', async () => {
    const dispatcher = new TestDispatcher()
    const repository = createRepository()
    const filesSelected = [createSelectedFile('src/dialog.tsx')]
    let dismissed = 0

    await stubIpcSend()

    function onDismissed() {
      dismissed++
    }

    const view = render(
      <GenerateCommitMessageOverrideWarning
        dispatcher={toDispatcher(dispatcher)}
        repository={repository}
        filesSelected={filesSelected}
        onDismissed={onDismissed}
      />
    )

    const dialog = view.container.querySelector(
      'dialog#generate-commit-message-override-warning'
    )
    const checkbox = view.container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement | null
    const overrideButton = Array.from(
      view.container.querySelectorAll('button')
    ).find(button => button.textContent?.includes('Override'))

    assert.notEqual(dialog, null)
    assert.notEqual(checkbox, null)
    assert.notEqual(overrideButton, null)
    assert.equal(dialog?.getAttribute('role'), 'alertdialog')
    assert.ok(screen.getByText('Commit message override'))
    assertAnnouncementIncludes(
      dialog!,
      'generate-commit-message-override-warning-body'
    )
    assert.equal(checkbox?.checked, false)

    fireEvent.click(checkbox!)
    fireEvent.click(overrideButton!)

    await waitFor(() => {
      assert.deepEqual(dispatcher.confirmOverrideValues, [false])
      assert.equal(dispatcher.generated.length, 1)
      assert.equal(dispatcher.generated[0]?.repository, repository)
      assert.deepEqual(dispatcher.generated[0]?.filesSelected, filesSelected)
      assert.equal(dismissed, 1)
    })
  })
})
