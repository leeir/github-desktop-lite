/* eslint-disable no-sync */
import { test, expect, dismissMoveToApplicationsDialog } from './e2e-fixtures'
import { smokeRepoPath, smokeRepoFileName } from './test-helpers'
import { execFileSync } from 'child_process'
import { appendFileSync } from 'fs'
import * as path from 'path'

test.use({ initialRepository: false })

test('review workspace, all settings, branch comparison, and AI commit', async ({
  app,
  mainWindow: page,
}, testInfo) => {
  await expect(page.locator('#no-repositories')).toBeVisible({ timeout: 15000 })
  if (process.platform === 'darwin') {
    await page.getByRole('button', { name: 'Not Now', exact: true }).waitFor()
    await page.getByLabel('Do not show this message again').check()
    await dismissMoveToApplicationsDialog(page)
  }
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    })
  }, smokeRepoPath)
  await page
    .getByRole('button', { name: 'Open repository…', exact: true })
    .click()
  await expect(page.locator('#repository')).toBeVisible({ timeout: 15000 })
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: smokeRepoPath, encoding: 'utf8' }).trim()
  const baseline = git('rev-parse', 'HEAD')
  git('branch', 'review-base', baseline)
  git('update-ref', 'refs/remotes/origin/main', baseline)
  git('checkout', '-b', 'review-ui')
  git('add', smokeRepoFileName)
  git('commit', '-m', 'Add agent review fixture')
  appendFileSync(
    path.join(smokeRepoPath, smokeRepoFileName),
    'Review this new agent change before committing.\n'
  )
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark')
    localStorage.setItem(
      'ai-settings',
      JSON.stringify({
        providerId: 'custom',
        model: 'test-model',
        baseUrl: 'https://llm.example.com/v1',
      })
    )
  })
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai-list-models')
    ipcMain.handle('ai-list-models', () => ({
      kind: 'ok',
      models: ['test-model'],
    }))
  })
  await page.reload()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1280, 860)
  )
  await expect(page.locator('.review-title')).toContainText('Review changes')
  await page.getByText(smokeRepoFileName, { exact: true }).first().click()
  await expect(page.locator('.diff-container')).toContainText(
    'Review this new agent change'
  )
  await page.screenshot({ path: testInfo.outputPath('01-workspace.png') })

  // Inspect every settings category in the real client, keeping all controls.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(
    page.getByRole('tablist', { name: 'Settings' }).getByRole('tab')
  ).toHaveCount(3)
  for (const name of ['general', 'ai', 'git']) {
    await page.locator(`#preferences-tab-${name}`).click()
    await expect(
      page.getByRole('tabpanel').getByRole('heading').first()
    ).toBeVisible()
    expect(
      await page
        .locator('#preferences .settings-body')
        .evaluate(e => e.scrollWidth <= e.clientWidth + 1)
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`settings-${name}.png`) })
  }
  await page.locator('#preferences-tab-general').click()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(850, 620)
  )
  await expect(
    page
      .locator('#preferences')
      .getByRole('button', { name: 'Done', exact: true })
  ).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('settings-compact.png') })
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1280, 860)
  )
  await page
    .locator('#preferences')
    .getByRole('button', { name: 'Done', exact: true })
    .click()

  await page
    .getByRole('button', { name: 'Compare branches', exact: true })
    .click()
  await expect(page.locator('dialog.open-pull-request')).toBeVisible()
  await expect(page.locator('dialog.open-pull-request')).toContainText(
    'Compare branches'
  )
  await expect(
    page.locator('dialog.open-pull-request .files-diff-viewer')
  ).toContainText('This file should appear')
  await page.locator('.base-branch-details button').click()
  await page.getByText('origin/main', { exact: true }).click()
  await expect(page.locator('.base-branch-details')).toContainText(
    'origin/main'
  )
  await expect(
    page.locator('dialog.open-pull-request .files-diff-viewer')
  ).toContainText('This file should appear')
  await page.screenshot({
    path: testInfo.outputPath('02-branch-comparison.png'),
  })
  await page
    .locator('dialog.open-pull-request')
    .getByRole('button', { name: 'Done', exact: true })
    .click()
  expect(git('branch', '--show-current')).toBe('review-ui')
  expect(git('status', '--short')).toContain(smokeRepoFileName)

  await page.locator('#history-tab').click()
  await expect(page.locator('.review-title')).toHaveText('Commit history')
  await page.screenshot({ path: testInfo.outputPath('03-history.png') })
  await page.locator('#changes-tab').click()

  // Only the model service response is mocked; real selected diff and parser run.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai-complete')
    ipcMain.handle('ai-complete', (_event, request) => {
      if (!request.userPrompt.includes('Review this new agent change')) {
        return { kind: 'error', message: 'Expected selected diff in request' }
      }
      return {
        kind: 'ok',
        text: JSON.stringify({
          title: 'Improve agent change review',
          description:
            'Show the latest agent changes for review before committing.',
        }),
      }
    })
  })
  await page
    .getByRole('button', {
      name: 'Generate commit message with AI',
      exact: true,
    })
    .click()
  await expect(page.locator('.summary-field input')).toHaveValue(
    'Improve agent change review'
  )
  await expect(page.locator('.ai-draft-label')).toHaveText('AI draft')
  await page.screenshot({ path: testInfo.outputPath('04-ai-draft.png') })
  await page.locator('[aria-label="Create commit"] .commit-button').click()
  await expect
    .poll(() => git('log', '-1', '--pretty=%s'))
    .toBe('Improve agent change review')
  await expect.poll(() => git('status', '--short')).toBe('')
  await expect(page.getByText('Ready for your next change')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('05-clean-worktree.png') })
})
