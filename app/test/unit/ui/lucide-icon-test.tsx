import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Octicon } from '../../../src/ui/octicons/octicon'
import * as icons from '../../../src/ui/octicons/octicons.generated'
import { diffCheck } from '../../../src/ui/octicons/diff'

// Guard the migration boundary: SVG primitives and the 24px artwork grid must
// survive the existing small-size API used by toolbar, list and diff consumers.
describe('Lucide icon rendering', () => {
  it('preserves complete artwork at small and large display sizes', () => {
    for (const height of [12, 16, 20, 24, 32]) {
      const markup = renderToStaticMarkup(
        <Octicon symbol={icons.gitBranch} height={height} />
      )
      assert.match(markup, /viewBox="0 0 24 24"/)
      assert.match(markup, new RegExp(`height="${height}"`))
      assert.match(markup, new RegExp(`width="${height}"`))
      assert.match(markup, /<circle/)
      assert.match(markup, /<path/)
      assert.match(markup, /fill="none"/)
      assert.match(markup, /stroke="currentColor"/)
    }
  })

  it('preserves compact diff controls and decorative accessibility', () => {
    const markup = renderToStaticMarkup(<Octicon symbol={diffCheck} />)
    assert.match(markup, /height="12"/)
    assert.match(markup, /aria-hidden="true"/)
    assert.match(markup, /data-icon="check"/)
  })

  it('keeps the GitHub brand filled while ordinary icons use outlines', () => {
    const markup = renderToStaticMarkup(<Octicon symbol={icons.markGithub} />)
    assert.match(markup, /class="octicon brand-icon icon-filled"/)
    assert.match(markup, /stroke="none"/)
    assert.match(markup, /fill="currentColor"/)
  })
})
