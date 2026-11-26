import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { GitSettings, GitConfirmation } from '../../../src/ui/preferences/git'

const allOn: Record<GitConfirmation, boolean> = {
  discardChanges: true,
  forcePush: true,
  undoCommit: true,
  removeRepository: true,
  discardStash: true,
  checkoutCommit: true,
  commitFilteredChanges: true,
}

describe('Git settings', () => {
  it('shows each confirmation as a switch and reports toggles', () => {
    const changes: Array<[GitConfirmation, boolean]> = []
    render(
      <GitSettings
        defaultBranch="main"
        onDefaultBranchChanged={() => {}}
        onDefaultBranchBlur={() => {}}
        confirmations={{ ...allOn, forcePush: false }}
        onConfirmationChanged={(id, ask) => changes.push([id, ask])}
        loadHookEnvironment={false}
        onLoadHookEnvironmentChanged={() => {}}
      />
    )

    // Seven confirmations plus the hook environment switch.
    assert.equal(screen.getAllByRole('switch').length, 8)

    const forcePush = screen.getByRole('switch', { name: 'Force pushing' })
    assert.equal(forcePush.getAttribute('aria-checked'), 'false')
    fireEvent.click(forcePush)

    const remove = screen.getByRole('switch', {
      name: 'Removing a repository or worktree',
    })
    assert.equal(remove.getAttribute('aria-checked'), 'true')
    fireEvent.click(remove)

    assert.deepStrictEqual(changes, [
      ['forcePush', true],
      ['removeRepository', false],
    ])
  })
})
