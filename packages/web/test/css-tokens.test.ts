/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findCssLiterals } from './css-literals.ts'

// Every stylesheet under src, read from disk (Vitest stubs imported CSS to '').
// The tokens file is the one place literals live.
const SRC = join(import.meta.dirname, '../src')
const TOKENS_FILE = 'tokens.css'
const stylesheets = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((path) =>
  path.endsWith('.css'),
)

describe('findCssLiterals', () => {
  it('flags a hex color', () => {
    expect(findCssLiterals('.a { color: #b00; }')).toEqual([
      { line: 1, property: 'color', literal: '#b00' },
    ])
  })

  it('flags rgb() and hsl() colors, with the line they sit on', () => {
    const css = '.a {\n  background: rgb(0 0 0 / 50%);\n  border-color: hsla(10, 50%, 50%, 1);\n}'
    expect(findCssLiterals(css)).toEqual([
      { line: 2, property: 'background', literal: 'rgb(0 0 0 / 50%)' },
      { line: 3, property: 'border-color', literal: 'hsla(10, 50%, 50%, 1)' },
    ])
  })

  it('flags named colors but not keywords, token names or property names', () => {
    const css =
      '.a { border: 1px solid Red; color: transparent; background: var(--surface-white);' +
      ' white-space: nowrap; outline: currentColor; }'
    expect(findCssLiterals(css)).toEqual([{ line: 1, property: 'border', literal: 'Red' }])
  })

  it('flags px in padding, margin, gap and border-radius, including longhands', () => {
    const css =
      '.a { padding: 6px 8px; margin-top: -4px; row-gap: 2px; gap: 1.5px;' +
      ' border-top-left-radius: 3px; width: 200px; border: 1px solid var(--border-subtle); margin: 0; }'
    expect(findCssLiterals(css).map((f) => `${f.property} ${f.literal}`)).toEqual([
      'padding 6px',
      'padding 8px',
      'margin-top -4px',
      'row-gap 2px',
      'gap 1.5px',
      'border-top-left-radius 3px',
    ])
  })

  it('flags references to primitive tokens, which belong to the tokens file only', () => {
    const css = '.a { color: var(--color-gray-700); gap: var(--space-2); background: var(--surface-panel); }'
    expect(findCssLiterals(css).map((f) => f.literal)).toEqual(['--color-gray-700', '--space-2'])
  })

  it('ignores selectors and comments', () => {
    const css = "/* color: #fff; */\nli[aria-selected='true'] a:hover { color: var(--accent); }"
    expect(findCssLiterals(css)).toEqual([])
  })
})

describe('editor CSS', () => {
  it('has a tokens file', () => {
    expect(stylesheets).toContain(TOKENS_FILE)
  })

  it.each(stylesheets.filter((path) => path !== TOKENS_FILE))(
    '%s uses semantic tokens instead of literals',
    (path) => {
      expect(findCssLiterals(readFileSync(join(SRC, path), 'utf8'))).toEqual([])
    },
  )
})
