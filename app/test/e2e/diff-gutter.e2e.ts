/* eslint-disable no-sync */
import { test, expect, dismissMoveToApplicationsDialog } from './e2e-fixtures'
import { smokeRepoPath } from './test-helpers'
import { mkdirSync, writeFileSync } from 'fs'
import * as path from 'path'

test.use({ initialRepository: false })

test('quiet diff gutter retains line, hunk and keyboard selection', async ({
  app,
  mainWindow: page,
}, testInfo) => {
  mkdirSync(path.join(smokeRepoPath, 'gradle'), { recursive: true })
  writeFileSync(
    path.join(smokeRepoPath, 'gradle/gradle-daemon-jvm.properties'),
    [
      '# JVM toolchains for this project',
      'toolchainVendor=ADOPTIUM',
      'toolchainVersion=25',
      '',
      '# Downloads are selected for each platform',
      'toolchainUrl.MAC_OS.AARCH64=https://example.com/jdk/macos-arm64',
      'toolchainUrl.MAC_OS.X86_64=https://example.com/jdk/macos-x64',
      'toolchainUrl.LINUX.AARCH64=https://example.com/jdk/linux-arm64',
      'toolchainUrl.LINUX.X86_64=https://example.com/jdk/linux-x64',
      'toolchainUrl.WINDOWS.X86_64=https://example.com/jdk/windows-x64',
      '',
      'downloadEnabled=true',
      '',
    ].join('\n')
  )
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
  await expect(page.locator('#repository')).toBeVisible()
  await page.evaluate(() => localStorage.setItem('theme', 'light'))
  await page.reload()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1280, 860)
  )
  await page
    .locator('.changed-file-name')
    .getByText('gradle-daemon-jvm.properties', { exact: true })
    .click()
  const diff = page.locator('.side-by-side-diff-container')
  const checks = diff.locator('.line-number.selectable input[type=checkbox]')
  await expect(checks).toHaveCount(12)
  await expect(checks.first()).toBeChecked()
  await page.mouse.move(1200, 80)
  await expect(diff.locator('.line-number-check .octicon').first()).toHaveCSS(
    'opacity',
    '0'
  )
  await expect(diff.locator('.line-number.line-selected').first()).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)'
  )
  expect(
    (await diff.locator('.line-number.selectable').first().boundingBox())!.width
  ).toBeLessThan(80)
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('01-gutter-light.png'),
  })
  const detail = (await page.locator('.diff-container').boundingBox())!
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('02-gutter-detail.png'),
    clip: { ...detail, height: Math.min(detail.height, 350) },
  })

  const firstLabel = diff.locator('.line-number.selectable > label').first()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].focus()
  )
  await page.bringToFront()
  await firstLabel.hover()
  await expect(diff.locator('.line-number-check .octicon').first()).toHaveCSS(
    'opacity',
    '0.8'
  )
  await firstLabel.click()
  await expect(checks.first()).not.toBeChecked()
  await expect(checks.nth(1)).toBeChecked()
  const group = diff.locator('input[aria-controls]').first()
  await expect(group).toHaveAttribute('aria-checked', 'mixed')
  await page.mouse.move(1200, 80)
  await expect(
    diff
      .locator('.line-number.selectable:not(.line-selected) .line-number-check')
      .first()
  ).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('03-partial-selection.png'),
  })
  await checks.first().focus()
  await page.keyboard.press('Space')
  await expect(checks.first()).toBeChecked()
  await expect(group).toHaveAttribute('aria-checked', 'true')
  await diff.locator('.hunk-handle').first().click()
  await expect(checks.first()).not.toBeChecked()
  await expect(checks.last()).not.toBeChecked()
  await expect(group).toHaveAttribute('aria-checked', 'false')
  await group.focus()
  await page.keyboard.press('Space')
  await expect(checks.first()).toBeChecked()
  await expect(checks.last()).toBeChecked()

  const start = (await firstLabel.boundingBox())!
  const end = (await diff
    .locator('.line-number.selectable > label')
    .nth(2)
    .boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 5,
  })
  await page.mouse.up()
  await expect(checks.first()).not.toBeChecked()
  await expect(checks.nth(2)).not.toBeChecked()
  await expect(checks.nth(3)).toBeChecked()
  await expect(group).toHaveAttribute('aria-checked', 'mixed')
  await group.focus()
  await page.keyboard.press('Space')
  await expect(checks.first()).toBeChecked()
  await expect(checks.nth(2)).toBeChecked()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('#preferences-tab-general').click()
  await page.getByRole('radio', { name: 'Dark', exact: true }).click()
  await page
    .locator('#preferences')
    .getByRole('button', { name: 'Done', exact: true })
    .click()
  await page.mouse.move(1200, 80)
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('04-gutter-dark.png'),
  })
  await page.getByRole('button', { name: 'Diff Settings', exact: true }).click()
  await page.getByRole('radio', { name: 'Split', exact: true }).click()
  await expect(
    page.getByRole('radio', { name: 'Split', exact: true })
  ).toBeChecked()
  await page.getByRole('button', { name: 'Diff Settings', exact: true }).click()
  await expect(diff).not.toHaveClass(/unified-diff/)
  await expect(checks.first()).toBeChecked()
  await diff.locator('.line-number.selectable > label').first().click()
  await expect(checks.first()).not.toBeChecked()
  await checks.first().focus()
  await page.keyboard.press('Space')
  await expect(checks.first()).toBeChecked()
  await page.mouse.move(1200, 80)
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('05-gutter-split.png'),
  })
})
