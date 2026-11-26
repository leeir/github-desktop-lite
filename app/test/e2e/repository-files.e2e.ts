/* eslint-disable no-sync */
import { test, expect, dismissMoveToApplicationsDialog } from './e2e-fixtures'
import { smokeRepoPath } from './test-helpers'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  symlinkSync,
} from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

test.use({ initialRepository: false })

test('browse working-tree files with bounded previews and return to review', async ({
  app,
  mainWindow: page,
}, testInfo) => {
  const source = `import { useState } from 'react'

interface ReviewItem {
  path: string
  additions: number
  deletions: number
}

// Keep the workspace focused on what changed and what is in the project.
export function ProjectReview({ files }: { files: ReviewItem[] }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  return (
    <main className="project-review">
      <header>
        <h1>Review your agent's changes</h1>
        <p>{files.length} files are ready to explore.</p>
      </header>
      <nav aria-label="Changed files">
        {files.map(file => (
          <button key={file.path} onClick={() => setSelectedPath(file.path)}>
            <span>{file.path}</span>
            <small>+{file.additions} −{file.deletions}</small>
          </button>
        ))}
      </nav>
      {selectedPath && <section>{selectedPath}</section>}
    </main>
  )
}
`
  mkdirSync(path.join(smokeRepoPath, 'src', 'components'), { recursive: true })
  mkdirSync(path.join(smokeRepoPath, 'src', 'hooks'))
  mkdirSync(path.join(smokeRepoPath, 'docs'))
  mkdirSync(path.join(smokeRepoPath, 'empty'))
  mkdirSync(path.join(smokeRepoPath, 'many'))
  writeFileSync(path.join(smokeRepoPath, 'src', 'ProjectReview.tsx'), source)
  writeFileSync(
    path.join(smokeRepoPath, 'src', 'index.ts'),
    "export { ProjectReview } from './ProjectReview'\n"
  )
  writeFileSync(
    path.join(smokeRepoPath, 'src', 'theme.css'),
    ':root { color-scheme: dark; }\n'
  )
  writeFileSync(
    path.join(smokeRepoPath, 'large.ts'),
    Array.from({ length: 8000 }, (_, i) => `const row${i} = ${i};`).join('\n')
  )
  writeFileSync(
    path.join(smokeRepoPath, 'huge.txt'),
    'bounded line\n'.repeat(200000)
  )
  writeFileSync(
    path.join(smokeRepoPath, 'binary.bin'),
    Buffer.from([0, 1, 2, 3])
  )
  writeFileSync(path.join(smokeRepoPath, 'empty.txt'), '')
  symlinkSync(
    path.join(smokeRepoPath, 'README.md'),
    path.join(smokeRepoPath, 'linked.md')
  )
  for (let i = 0; i < 600; i++) {
    writeFileSync(path.join(smokeRepoPath, 'many', `file-${i}.ts`), 'export {}')
  }

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
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1280, 860)
  )
  const filesMode = page.getByRole('button', { name: 'Files', exact: true })
  await expect(page.locator('.repository-files')).toHaveCount(0)
  await page.locator('.summary-field input').fill('Draft before browsing')
  await filesMode.click()
  await expect(page.getByText('Explore your project')).toBeVisible()
  await expect(
    page.getByRole('treeitem', { name: '.git, directory', exact: true })
  ).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('01-files-home.png') })
  const row = (name: string) =>
    page.getByRole('treeitem', { name, exact: true })
  await row('src, directory').click()
  const started = Date.now()
  await row('ProjectReview.tsx, file').click()
  await expect(page.locator('.repository-code')).toContainText(
    "Review your agent's changes"
  )
  const openTime = Date.now() - started
  await expect(
    page.locator('.repository-code .cm-keyword').first()
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('02-code-preview.png') })
  await expect(
    page.locator(
      '.repository-file-preview textarea, .repository-file-preview [contenteditable=true]'
    )
  ).toHaveCount(0)
  expect(
    readFileSync(path.join(smokeRepoPath, 'src', 'ProjectReview.tsx'), 'utf8')
  ).toBe(source)

  await page
    .getByRole('navigation', { name: 'Workspace view' })
    .getByRole('button', { name: /^Review\b/ })
    .click()
  await expect(page.locator('.review-workspace')).toBeVisible()
  await expect(page.locator('.summary-field input')).toHaveValue(
    'Draft before browsing'
  )
  await expect(page.locator('.repository-files')).toBeHidden()
  await filesMode.click()
  await expect(page.locator('.file-preview-path')).toHaveText(
    path.join('src', 'ProjectReview.tsx')
  )
  await expect(page.locator('.repository-code')).toContainText('ProjectReview')
  writeFileSync(
    path.join(smokeRepoPath, 'src', 'ProjectReview.tsx'),
    source + '\n// Updated by the agent\n'
  )
  await page.getByRole('button', { name: 'Refresh files', exact: true }).click()
  await expect(page.locator('.repository-code')).toContainText(
    'Updated by the agent'
  )

  await page
    .getByRole('button', { name: 'Collapse all folders', exact: true })
    .click()
  await row('empty, directory').click()
  await expect(
    page.getByRole('treeitem', { name: 'empty, directory, Empty', exact: true })
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Collapse all folders', exact: true })
    .click()
  await row('binary.bin, file').click()
  await expect(page.getByText('No code preview')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('03-binary.png') })
  await row('empty.txt, file').click()
  await expect(page.getByText('This file is empty.')).toBeVisible()
  await row('linked.md, link, Link').click()
  await expect(
    page.locator('.repository-file-preview [role=alert]')
  ).toContainText('Symbolic links')
  await row('huge.txt, file').click()
  await expect(page.locator('.files-notice')).toContainText('Preview limited')
  expect(await page.locator('.repository-code-line').count()).toBeLessThan(100)
  await page.screenshot({ path: testInfo.outputPath('04-bounded-preview.png') })
  await row('large.ts, file').click()
  await expect(page.locator('.repository-code')).toContainText('const row0')
  const renderedLines = await page.locator('.repository-code-line').count()
  expect(renderedLines).toBeLessThan(100)
  await page
    .locator('.repository-code .ReactVirtualized__Grid')
    .evaluate(element => {
      element.scrollTop = 175500
    })
  await expect(page.locator('.repository-code')).toContainText('row7999')
  await page.getByRole('button', { name: 'Refresh files', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Refresh files', exact: true })
  ).toBeEnabled()
  await expect(page.locator('.repository-code')).toContainText('row7999')

  // Rapid navigation must not replace the latest file with an older read/highlight.
  await row('huge.txt, file').click()
  await row('README.md, file').click()
  await expect(page.locator('.file-preview-path')).toHaveText('README.md')
  await expect(page.locator('.repository-code')).toContainText(
    'GitHub Desktop Smoke Repo'
  )
  await expect(page.locator('.repository-code')).not.toContainText(
    'bounded line'
  )
  unlinkSync(path.join(smokeRepoPath, 'README.md'))
  await page.getByRole('button', { name: 'Refresh files', exact: true }).click()
  await expect(
    page.locator('.repository-file-preview [role=alert]')
  ).toContainText('no longer exists')

  await row('many, directory').click()
  await expect(
    page.getByRole('treeitem', { name: 'file-0.ts, file', exact: true })
  ).toBeVisible()
  const renderedEntries = await page.getByRole('treeitem').count()
  expect(renderedEntries).toBeLessThan(60)
  await page
    .getByRole('button', { name: 'Collapse all folders', exact: true })
    .click()
  await row('src, directory').click()
  await row('index.ts, file').click()
  // Keyboard activation uses the same path as pointer navigation.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('.file-preview-path')).toHaveText(
    path.join('src', 'theme.css')
  )
  await row('ProjectReview.tsx, file').click()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(960, 660)
  )
  await expect(
    page.getByRole('button', { name: 'Copy code', exact: true })
  ).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('05-compact-preview.png') })
  // Exercise native pointer selection across syntax-highlighted tokens. A DOM
  // Range that directly sets the selection would miss user-select regressions.
  const code = page.locator('.repository-code-line code').first()
  const selectionPoints = await code.evaluate(element => {
    const point = (offset: number) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node: Node | null
      while ((node = walker.nextNode())) {
        const length = node.textContent?.length ?? 0
        if (offset <= length) {
          const range = document.createRange()
          range.setStart(node, offset)
          range.setEnd(node, offset)
          const rect = range.getBoundingClientRect()
          return { x: rect.x, y: rect.y + rect.height / 2 }
        }
        offset -= length
      }
      throw new Error('Selection offset outside code line')
    }
    return {
      start: point(2),
      end: point(12),
      expected: element.textContent?.slice(2, 12),
    }
  })
  await page.mouse.move(selectionPoints.start.x, selectionPoints.start.y)
  await page.mouse.down()
  await page.mouse.move(selectionPoints.end.x, selectionPoints.end.y, {
    steps: 12,
  })
  await page.mouse.up()
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe(selectionPoints.expected)
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+c' : 'Control+c'
  )
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    selectionPoints.expected
  )
  await page.getByRole('button', { name: 'Copy code', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Copied', exact: true })
  ).toBeVisible()
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain(
    'ProjectReview'
  )

  const otherRepo = path.join(smokeRepoPath, 'second-repository')
  mkdirSync(otherRepo)
  execFileSync('git', ['init'], { cwd: otherRepo })
  writeFileSync(path.join(otherRepo, 'second-only.md'), '# Another project')
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    })
  }, otherRepo)
  await page
    .getByRole('button', { name: path.basename(smokeRepoPath), exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Add local repository…', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'second-repository', exact: true })
  ).toBeVisible()
  await filesMode.click()
  await expect(page.locator('.file-preview-path')).toHaveText('File preview')
  await row('second-only.md, file').click()
  await expect(page.locator('.repository-code')).toContainText(
    'Another project'
  )
  await expect(page.locator('.repository-code')).not.toContainText(
    'ProjectReview'
  )

  await testInfo.attach('bounded-rendering', {
    body: JSON.stringify({
      openTimeMs: openTime,
      renderedLines,
      totalLines: 8000,
      renderedEntries,
      totalEntries: 600,
    }),
    contentType: 'application/json',
  })
  console.log(
    JSON.stringify({
      openTimeMs: openTime,
      renderedLines,
      totalLines: 8000,
      renderedEntries,
      totalEntries: 600,
    })
  )
})
