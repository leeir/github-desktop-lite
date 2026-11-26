/* eslint-disable no-sync */
import { test, expect, dismissMoveToApplicationsDialog } from './e2e-fixtures'
import { smokeRepoPath } from './test-helpers'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

test.use({ initialRepository: false })

test('lightweight search and refined review surfaces', async ({
  app,
  mainWindow: page,
}, testInfo) => {
  const root = smokeRepoPath
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  for (const dir of [
    'src/components',
    'src/hooks',
    'docs',
    'many',
    'node_modules',
  ]) {
    mkdirSync(path.join(root, dir), { recursive: true })
  }
  const base = Array.from(
    { length: 80 },
    (_, i) => `export const line${i} = ${i}`
  ).join('\n')
  writeFileSync(path.join(root, 'src/components/ReviewPanel.tsx'), base)
  writeFileSync(
    path.join(root, 'src/hooks/useReview.ts'),
    'export const useReview = () => null\n'
  )
  writeFileSync(
    path.join(root, 'docs/ReviewPanel.tsx'),
    '// documentation example\n'
  )
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\nmany/\n')
  git('add', '.')
  git('commit', '-m', 'Add review fixtures')
  const changed = base
    .replace('line5 = 5', 'line5 = 500')
    .replace('line40 = 40', 'line40 = 4000')
  writeFileSync(path.join(root, 'src/components/ReviewPanel.tsx'), changed)
  writeFileSync(
    path.join(root, 'src/hooks/useReview.ts'),
    'export const useReview = () => true\n'
  )
  writeFileSync(
    path.join(root, 'src/components/NewPanel.tsx'),
    'export const NewPanel = () => null\n'
  )
  writeFileSync(path.join(root, 'node_modules/ReviewPanel.tsx'), 'ignored')
  writeFileSync(
    path.join(root, 'long.ts'),
    Array.from({ length: 8000 }, (_, i) => `const row${i} = ${i};`).join('\n')
  )
  writeFileSync(path.join(root, 'huge.txt'), 'bounded line\n'.repeat(200000))
  writeFileSync(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2]))
  writeFileSync(
    path.join(root, 'wide.txt'),
    ' '.repeat(2000) + 'visible-target'
  )
  for (let i = 0; i < 10000; i++) {
    writeFileSync(path.join(root, 'many', `item-${i}.ts`), '')
  }
  // A large tracked directory, ignored for untracked traversal but searchable via Git's index.
  git('add', '-f', 'many')
  git('commit', '-m', 'Add indexed files for search performance')

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
  }, root)
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
    .getByText('ReviewPanel.tsx', { exact: true })
    .click()
  await expect(page.locator('.side-by-side-diff-container')).toContainText(
    '500'
  )
  await page
    .locator('.summary-field input')
    .fill('Draft preserved while browsing')
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('01-review-light.png'),
  })
  const gutter = page.locator('.line-number.line-selected').first()
  expect(await gutter.evaluate(e => getComputedStyle(e).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)'
  )
  const check = page
    .locator('.changes-list-container .file input[type=checkbox]')
    .first()
  await check.uncheck()
  await expect(check).not.toBeChecked()
  await check.check()
  await expect(check).toBeChecked()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('#preferences-tab-general').click()
  await page.getByRole('radio', { name: 'Dark', exact: true }).click()
  await page
    .locator('#preferences')
    .getByRole('button', { name: 'Done', exact: true })
    .click()
  await page
    .locator('.changed-file-name')
    .getByText('ReviewPanel.tsx', { exact: true })
    .click()
  await expect(page.locator('.side-by-side-diff-container')).toContainText(
    '500'
  )
  await expect(page.locator('body')).toHaveClass(/theme-dark/)
  await expect
    .poll(() =>
      page
        .locator('.commit-draft-editor')
        .evaluate(e => getComputedStyle(e).backgroundImage)
    )
    .toContain('linear-gradient(')
  expect(
    await page
      .locator('.changes-list-container .list-item')
      .first()
      .evaluate(e => getComputedStyle(e).borderBottomWidth)
  ).toBe('0px')
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('02-review-dark.png'),
  })
  for (const [label, filename] of [
    [path.basename(root), '08-repository-picker.png'],
    [git('branch', '--show-current').trim(), '09-branch-picker.png'],
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('#foldout-container .foldout')).toBeVisible()
    expect(
      await page
        .locator('#foldout-container .foldout')
        .evaluate(e => getComputedStyle(e).borderTopLeftRadius)
    ).toBe('14px')
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(filename),
    })
    await page.keyboard.press('Escape')
    await expect(page.locator('#foldout-container .foldout')).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  const treeRow = (name: string) =>
    page.getByRole('treeitem', { name, exact: true })
  await treeRow('src, directory').click()
  await expect(treeRow('src, directory')).toHaveAttribute(
    'aria-expanded',
    'true'
  )
  await treeRow('components, directory').click()
  await expect(treeRow('ReviewPanel.tsx, file')).toHaveAttribute(
    'aria-level',
    '3'
  )
  await treeRow('ReviewPanel.tsx, file').click()
  await expect(treeRow('docs, directory')).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('06-expanded-tree.png'),
  })
  await page
    .getByRole('button', { name: 'Collapse all folders', exact: true })
    .click()
  await expect(treeRow('ReviewPanel.tsx, file')).toHaveCount(0)
  await expect(page.locator('.file-preview-path')).toHaveText(
    'src/components/ReviewPanel.tsx'
  )
  await page
    .getByRole('button', { name: 'Reveal current file', exact: true })
    .click()
  await expect(treeRow('ReviewPanel.tsx, file')).toBeVisible()
  await expect(treeRow('ReviewPanel.tsx, file')).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page
    .getByRole('tree', { name: 'Project files', exact: true })
    .press('ArrowLeft')
  await expect(treeRow('components, directory')).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.keyboard.press('ArrowLeft')
  await expect(treeRow('components, directory')).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  await page.keyboard.press('ArrowRight')
  await expect(treeRow('ReviewPanel.tsx, file')).toBeVisible()
  const names = page.getByRole('searchbox', {
    name: 'Find a file',
    exact: true,
  })
  const row = (name: string) => page.getByRole('option', { name, exact: true })
  await names.fill('reviewpanel')
  await expect(
    page.locator('.filename-search .files-directory-footer')
  ).toHaveText('2 files found')
  await expect(row('node_modules/ReviewPanel.tsx')).toHaveCount(0)
  await row('src/components/ReviewPanel.tsx').click()
  await expect(page.locator('.file-preview-path')).toHaveText(
    'src/components/ReviewPanel.tsx'
  )
  await page.locator('.repository-code').click({ position: { x: 250, y: 10 } })
  await page.locator('.repository-code').evaluate(container => {
    const cells = container.querySelectorAll('code')
    const range = document.createRange()
    range.setStart(cells[0], 0)
    range.setEnd(cells[1], cells[1].childNodes.length)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.copy()
  )
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe('export const line0 = 0\nexport const line1 = 1')
  await app.evaluate(({ Menu, clipboard }) => {
    clipboard.writeText('before context copy')
    const original = Menu.prototype.popup
    Menu.prototype.popup = function (options) {
      Menu.prototype.popup = original
      this.items.find(item => item.label === 'Copy')?.click()
      options?.callback?.()
    }
  })
  await page
    .locator('.repository-code code')
    .first()
    .click({ button: 'right', position: { x: 20, y: 5 } })
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe('export const line0 = 0\nexport const line1 = 1')
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('07-selected-code.png'),
  })
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
  // Exercise the actual application menu command, not just a synthetic keydown.
  await app.evaluate(({ Menu }) => {
    const find = (
      items: Electron.MenuItem[]
    ): Electron.MenuItem | undefined => {
      for (const item of items) {
        if (item.accelerator?.toString().toLowerCase().endsWith('+f')) {
          return item
        }
        const nested = item.submenu && find(item.submenu.items)
        if (nested) {
          return nested
        }
      }
      return undefined
    }
    const item = find(Menu.getApplicationMenu()!.items)
    if (!item) {
      throw new Error('Find menu item missing')
    }
    item.click()
  })
  const findCode = page.getByRole('textbox', {
    name: 'Find in current file',
    exact: true,
  })
  await expect(findCode).toBeFocused()
  await findCode.fill('export')
  await expect(page.locator('.file-match-count')).toHaveText('1 / 80')
  await findCode.press('Enter')
  await expect(page.locator('.file-match-count')).toHaveText('2 / 80')
  await findCode.press('Shift+Enter')
  await expect(page.locator('.file-match-count')).toHaveText('1 / 80')
  await expect(page.locator('.cm-file-search-current').first()).toBeVisible()
  const searchBox = await names.boundingBox()
  const resultsBox = await page.locator('.filename-search-scope').boundingBox()
  expect(resultsBox!.y - searchBox!.y).toBeLessThan(60)
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('03-search-code.png'),
  })
  await findCode.fill('no such content')
  await expect(page.locator('.file-match-count')).toHaveText('No matches')
  await findCode.press('Escape')
  await expect(findCode).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Find in file', exact: true })
  ).toBeFocused()
  await names.fill('item-')
  await expect(
    page.locator('.filename-search .files-directory-footer')
  ).toContainText('200 matches shown')
  const renderedResults = await page.locator('.filename-match').count()
  expect(renderedResults).toBeLessThan(40)
  const start = Date.now()
  await names.fill('item-9999')
  await expect(row('many/item-9999.ts')).toBeVisible()
  const filenameSearchMs = Date.now() - start
  await names.fill('absent')
  await names.fill('NewPanel')
  await expect(row('src/components/NewPanel.tsx')).toBeVisible()
  await expect(
    page.locator('.filename-search .files-directory-footer')
  ).toHaveText('1 file found')
  await names.fill('long.ts')
  await names.press('Enter')
  // Wait for the debounced result before using Enter.
  if (
    !(await page.locator('.file-preview-path').textContent())?.endsWith(
      'long.ts'
    )
  ) {
    await expect(row('long.ts')).toBeVisible()
    await names.press('Enter')
  }
  await expect(page.locator('.file-preview-path')).toHaveText('long.ts')
  await page.getByRole('button', { name: 'Find in file', exact: true }).click()
  const findStart = Date.now()
  await findCode.fill('row7999')
  await expect(page.locator('.cm-file-search-current')).toHaveText('row7999')
  await expect(page.locator('.cm-file-search-current')).toBeInViewport()
  const inFileSearchMs = Date.now() - findStart
  expect(await page.locator('.repository-code-line').count()).toBeLessThan(100)
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('04-search-large-file.png'),
  })
  await names.fill('wide.txt')
  await row('wide.txt').click()
  await findCode.fill('visible-target')
  await expect(page.locator('.cm-file-search-current')).toBeInViewport()
  await names.fill('huge.txt')
  await row('huge.txt').click()
  await findCode.fill('line')
  await expect(page.getByText('Searching preview only')).toBeVisible()
  await expect(page.locator('.file-match-count')).toHaveText('1 / 1000+')
  await names.fill('binary.bin')
  await row('binary.bin').click()
  await expect(findCode).toBeHidden()
  await expect(page.getByText('No code preview')).toBeVisible()
  await names.fill('reviewpanel')
  await row('src/components/ReviewPanel.tsx').click()
  await findCode.fill('export')
  writeFileSync(
    path.join(root, 'src/components/ReviewPanel.tsx'),
    'export const refreshed = true\n'
  )
  await page.getByRole('button', { name: 'Refresh files', exact: true }).click()
  await expect(page.locator('.file-match-count')).toHaveText('1 / 1')
  await names.press('Escape')
  await expect(page.locator('[aria-label="Project files"]')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Workspace view' })
    .getByRole('button', { name: /^Review\b/ })
    .click()
  await expect(page.locator('.summary-field input')).toHaveValue(
    'Draft preserved while browsing'
  )
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  await names.fill('reviewpanel')
  await expect(row('docs/ReviewPanel.tsx')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(960, 660)
  )
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('05-compact-search.png'),
  })
  expect(
    await page
      .locator('.repository-files')
      .evaluate(e => e.scrollWidth <= e.clientWidth)
  ).toBe(true)
  expect(
    readFileSync(path.join(root, 'src/components/ReviewPanel.tsx'), 'utf8')
  ).toBe('export const refreshed = true\n')
  console.log(
    JSON.stringify({
      indexedFiles: 10000,
      renderedResults,
      filenameSearchMs,
      inFileSearchMs,
    })
  )
})
