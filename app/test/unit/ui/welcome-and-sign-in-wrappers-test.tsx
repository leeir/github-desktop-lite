import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Account } from '../../../src/models/account'
import type {
  IAuthenticationState,
  IEndpointEntryState,
  IExistingAccountWarning,
} from '../../../src/lib/stores/sign-in-store'
import {
  SignInStep,
  SignInStore,
  SignInResult,
} from '../../../src/lib/stores/sign-in-store'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { ConfigureGit } from '../../../src/ui/welcome/configure-git'
import { SignInEnterprise } from '../../../src/ui/welcome/sign-in-enterprise'
import { SignIn } from '../../../src/ui/lib/sign-in'
import { trampolineUIHelper } from '../../../src/lib/trampoline/trampoline-ui-helper'
import { Popup } from '../../../src/models/popup'
import { createTestSignInStore } from '../../helpers/app-store-test-harness'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function noopResultCallback() {}

class TestDispatcher {
  public readonly enteredEndpoints = new Array<string>()
  public readonly confirmationGuidanceRequests = new Array<boolean>()
  public readonly popups = new Array<Popup>()
  public browserSignInCount = 0
  public resetCount = 0
  public closedPopupCount = 0

  public constructor(private readonly signInStore?: SignInStore) {}

  public async setSignInEndpoint(url: string, isEndpointFromGit = false) {
    this.enteredEndpoints.push(url)
    this.confirmationGuidanceRequests.push(isEndpointFromGit)
    await this.signInStore?.setEndpoint(url, isEndpointFromGit)
  }

  public requestBrowserAuthentication() {
    this.browserSignInCount++
  }

  public beginEnterpriseSignIn(callback?: (result: SignInResult) => void) {
    this.signInStore?.beginEnterpriseSignIn(callback)
  }

  public beginDotComSignIn(callback?: (result: SignInResult) => void) {
    this.signInStore?.beginDotComSignIn(callback)
  }

  public resetSignInState() {
    this.resetCount++
    this.signInStore?.reset()
  }

  public showPopup(popup: Popup) {
    this.popups.push(popup)
  }

  public closePopup() {
    this.closedPopupCount++
  }
}

function toDispatcher(dispatcher: TestDispatcher): Dispatcher {
  return dispatcher as unknown as Dispatcher
}

function createEndpointState(): IEndpointEntryState {
  return {
    kind: SignInStep.EndpointEntry,
    error: null,
    loading: false,
    resultCallback: noopResultCallback,
  }
}

function createAuthenticationState(endpoint: string): IAuthenticationState {
  return {
    kind: SignInStep.Authentication,
    endpoint,
    error: null,
    loading: false,
    resultCallback: noopResultCallback,
  }
}

function createConfirmationState(): IAuthenticationState {
  return {
    kind: SignInStep.Authentication,
    endpoint: 'https://enterprise.example.com/api/v3',
    isUnrecognizedEnterpriseServer: true,
    error: null,
    loading: false,
    resultCallback: noopResultCallback,
  }
}

function createExistingAccountWarningState(): IExistingAccountWarning {
  return {
    kind: SignInStep.ExistingAccountWarning,
    endpoint: 'https://api.github.com',
    existingAccount: new Account(
      'mona',
      'https://api.github.com',
      'token',
      [],
      '',
      1,
      'Mona Lisa'
    ),
    error: null,
    loading: false,
    resultCallback: noopResultCallback,
  }
}

describe('welcome and sign-in wrappers', () => {
  let restoreIpcSend: (() => void) | undefined

  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }
  })

  afterEach(() => {
    restoreIpcSend?.()
  })

  it('shows server guidance alongside browser sign-in in the shared wrapper', async () => {
    const dispatcher = new TestDispatcher()
    const state = createConfirmationState()
    render(
      <SignIn signInState={state} dispatcher={toDispatcher(dispatcher)}>
        <button type="button">Cancel</button>
      </SignIn>
    )

    assert.ok(screen.getByText('https://enterprise.example.com'))
    assert.ok(
      screen.getByText(
        'Git is requesting permission to sign in to this server:'
      )
    )
    assert.ok(
      screen.getByText('Only continue if you recognize and trust this server.')
    )
    assert.ok(
      screen.getByText(
        /Confirm this address appears in your browser\. Otherwise, cancel and contact your repository administrator\./
      )
    )
    assert.strictEqual(screen.queryByRole('list'), null)
    const warning = document.querySelector('.enterprise-server-warning')
    assert.ok(warning)
    assert.strictEqual(
      warning.querySelector('svg')?.getAttribute('aria-hidden'),
      'true'
    )
    fireEvent.click(
      screen.getByRole('link', { name: /sign in using your browser/i })
    )

    assert.deepStrictEqual(dispatcher.enteredEndpoints, [])
    assert.deepStrictEqual(dispatcher.confirmationGuidanceRequests, [])
    assert.strictEqual(dispatcher.browserSignInCount, 1)
  })

  it('does not prompt for sign-in when Git asks about another server', async () => {
    const store = createTestSignInStore()
    const dispatcher = new TestDispatcher(store)
    trampolineUIHelper.setDispatcher(toDispatcher(dispatcher))

    // Only GitHub.com accounts are supported.
    const result = await trampolineUIHelper.promptForGitHubSignIn(
      'https://enterprise.example.com/team/project.git'
    )

    assert.strictEqual(result, undefined)
    assert.strictEqual(dispatcher.popups.length, 0)
    assert.strictEqual(dispatcher.browserSignInCount, 0)
  })

  it('submits enterprise endpoints through the shared sign-in wrapper', () => {
    const dispatcher = new TestDispatcher()

    render(
      <SignIn
        signInState={createEndpointState()}
        dispatcher={toDispatcher(dispatcher)}
      >
        <button type="button">Cancel</button>
      </SignIn>
    )

    const input = screen.getByLabelText('Enterprise address')
    const continueButton = screen.getByRole('button', { name: 'Continue' })

    fireEvent.change(input, {
      target: { value: 'https://enterprise.example.com' },
    })
    fireEvent.click(continueButton)

    assert.deepEqual(dispatcher.enteredEndpoints, [
      'https://enterprise.example.com',
    ])
    assert.ok(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('renders warning and browser-authentication states in the shared sign-in wrapper', () => {
    const dispatcher = new TestDispatcher()
    const view = render(
      <SignIn
        signInState={createExistingAccountWarningState()}
        dispatcher={toDispatcher(dispatcher)}
      >
        <button type="button">Cancel</button>
      </SignIn>
    )

    assert.ok(screen.getByText("You're already signed in to", { exact: false }))
    assert.ok(screen.getByText('github.com', { exact: false }))
    assert.ok(screen.getByText('mona'))

    const browserLink = screen.getByRole('link', {
      name: 'Sign in using your browser',
    })

    fireEvent.click(browserLink)

    assert.equal(dispatcher.browserSignInCount, 1)

    view.rerender(
      <SignIn
        signInState={{
          kind: SignInStep.Success,
          resultCallback: noopResultCallback,
        }}
        dispatcher={toDispatcher(dispatcher)}
      />
    )

    assert.equal(view.container.textContent, '')
  })

  it('renders the enterprise welcome step only when sign-in state exists and its cancel button returns to start', () => {
    const dispatcher = new TestDispatcher()
    const advancedSteps = new Array<string>()

    function advance(step: string) {
      advancedSteps.push(step)
    }

    const view = render(
      <SignInEnterprise
        dispatcher={toDispatcher(dispatcher)}
        advance={advance}
        signInState={null}
      />
    )

    assert.equal(view.container.textContent, '')

    view.rerender(
      <SignInEnterprise
        dispatcher={toDispatcher(dispatcher)}
        advance={advance}
        signInState={createAuthenticationState('https://api.github.com')}
      />
    )

    assert.ok(screen.getByText('Sign in to your GitHub Enterprise'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    assert.deepEqual(advancedSteps, ['Start'])
  })

  it('renders the configure-git welcome step and returns to start when cancelled', () => {
    const advancedSteps = new Array<string>()
    let doneCount = 0

    function advance(step: string) {
      advancedSteps.push(step)
    }

    function done() {
      doneCount++
    }

    render(
      <ConfigureGit
        accounts={[]}
        advance={advance}
        done={done}
        globalUserName={undefined}
        globalUserEmail={undefined}
      />
    )

    assert.ok(screen.getByText('Configure Git'))
    assert.ok(
      screen.getByText('This is used to identify the commits you create.', {
        exact: false,
      })
    )
    assert.ok(screen.getByRole('button', { name: 'Finish' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    assert.deepEqual(advancedSteps, ['Start'])
    assert.equal(doneCount, 0)
  })
})
