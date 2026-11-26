import { test, expect, dismissMoveToApplicationsDialog } from './e2e-fixtures'
import {
  smokeRepoPath,
  smokeRepoFileName,
  smokeRepoFileContents,
} from './test-helpers'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

test.use({ initialRepository: false })

test('first launch opens a local folder without onboarding or an add dialog', async ({
  app,
  mainWindow: page,
}, testInfo) => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1120, 780)
  })
  await expect(page.locator('#no-repositories')).toBeVisible()
  if (process.platform === 'darwin') {
    // Unpackaged test launches are outside /Applications; dismiss that
    // installation-only prompt before reviewing the installed-app flow.
    await page.getByRole('button', { name: 'Not Now', exact: true }).waitFor()
    await page.getByLabel('Do not show this message again').check()
    await dismissMoveToApplicationsDialog(page)
  }
  await expect(page.locator('#welcome')).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('00-system-appearance.png'),
  })
  // Select the real persisted dark preference for the requested dark UI review.
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload()
  await expect(page.locator('#no-repositories')).toBeVisible()
  await expect(page.locator('body')).toHaveClass(/theme-dark/)
  const open = page.getByRole('button', {
    name: 'Open repository…',
    exact: true,
  })
  await expect(open).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('01-first-launch.png') })

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.locator('dialog#preferences')).toBeVisible()
  await page
    .locator('dialog#preferences')
    .getByRole('button', { name: 'Done', exact: true })
    .click()
  await expect(page.locator('dialog#preferences')).toHaveCount(0)

  // Substitute only the native picker's response. App IPC, validation, database,
  // repository selection, and rendering remain the real Electron app.
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
  })
  await open.click()
  await expect(open).toBeEnabled()
  await expect(page.locator('#no-repositories [role="alert"]')).toHaveCount(0)
  await expect(open).toBeFocused()
  await page.screenshot({
    path: testInfo.outputPath('02-picker-cancelled.png'),
  })

  const invalidPath = await fs.mkdtemp(
    path.join(os.tmpdir(), 'lite-empty-folder-')
  )
  try {
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      })
    }, invalidPath)
    await open.click()
    await expect(page.locator('#no-repositories [role="alert"]')).toContainText(
      'isn’t a Git repository'
    )
    await expect(page.locator('#add-existing-repository')).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('03-invalid-folder.png'),
    })
    await expect.poll(() => fs.readdir(invalidPath)).toEqual([])
  } finally {
    await fs.rm(invalidPath, { recursive: true, force: true })
  }

  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    })
  }, smokeRepoPath)
  await page.getByRole('button', { name: 'Choose another folder…' }).click()
  await expect(page.locator('#no-repositories')).toHaveCount(0)
  await expect(page.locator('#add-existing-repository')).toHaveCount(0)
  await expect(page.locator('#welcome')).toHaveCount(0)
  await page.getByText(smokeRepoFileName, { exact: true }).first().click()
  await expect(page.locator('.diff-container')).toContainText(
    smokeRepoFileContents
  )
  await expect(page.locator('#repository-sidebar')).toContainText(
    smokeRepoFileName
  )
  await page.screenshot({
    path: testInfo.outputPath('04-repository-opened.png'),
  })

  // Reload reads the registered repository from the real isolated IndexedDB.
  await page.reload()
  await expect(page.locator('.diff-container')).toContainText(
    smokeRepoFileContents
  )
  await expect(page.locator('#no-repositories')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('05-reopened.png') })
})
