import assert from 'node:assert/strict'
import { it, mock } from 'node:test'
import * as React from 'react'
import { NoRepositoriesView } from '../../../src/ui/no-repositories/no-repositories-view'
import { render, fireEvent, waitFor } from '../../helpers/ui/render'

it('opens the folder picker once and stays ready after cancellation', async () => {
  let finish!: () => void
  const onAdd = mock.fn(
    () =>
      new Promise<void>(resolve => {
        finish = resolve
      })
  )
  const settings = mock.fn()
  const view = render(
    <NoRepositoriesView onAdd={onAdd} onShowSettings={settings} />
  )
  const button = view.getByRole('button', { name: 'Open repository…' })
  fireEvent.click(button)
  fireEvent.click(button)
  assert.equal(onAdd.mock.callCount(), 1)
  assert.equal(button.getAttribute('aria-disabled'), 'true')
  finish()
  await waitFor(() => assert.equal(button.textContent, 'Open repository…'))
  assert.equal(view.queryByRole('alert'), null)
  assert.equal(document.activeElement, button)
  fireEvent.click(view.getByRole('button', { name: 'Settings' }))
  assert.equal(settings.mock.callCount(), 1)
})

it('shows an invalid-folder error inline and clears it when retrying', async () => {
  let calls = 0
  const onAdd = async (onInvalidPath: (message: string) => void) => {
    if (calls++ === 0) {
      onInvalidPath('This folder is not a Git repository.')
    }
  }
  const view = render(
    <NoRepositoriesView onAdd={onAdd} onShowSettings={() => {}} />
  )
  fireEvent.click(view.getByRole('button', { name: 'Open repository…' }))
  await waitFor(() =>
    assert.match(
      view.getByRole('alert').textContent ?? '',
      /not a Git repository/
    )
  )
  fireEvent.click(view.getByRole('button', { name: 'Choose another folder…' }))
  await waitFor(() => assert.equal(view.queryByRole('alert'), null))
  assert.equal(calls, 2)
})
