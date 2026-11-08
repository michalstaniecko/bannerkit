// #14: AutoFit in the Inspector and a text Layer's Auto height. The editor gives the
// Text Layout of a text Layer (core `layoutText` with the measure the Canvas draws
// with); here that measure is injected and deterministic: every character is half the
// font size wide, so the expected sizes and heights below are worked out by hand.
import { selectionBox, type MeasureText } from '@bannerkit/core'
import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect, text } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

/** Every character (space included) is `size / 2` px wide, plus `letterSpacing`. */
const measure: MeasureText = (font, s, letterSpacing) => s.length * (font.size / 2 + letterSpacing)

describe('the Text Layout the editor gives', () => {
  it('is laid out with the editor’s measure, shrunk by AutoFit', async () => {
    // One line of 'Summer sale' (11 × 10 = 110 px ≤ 200). A line is size × 1.13 tall:
    // 20 → 22.6 and 18 → 20.34 overflow a 20 px Box, 17 → 19.21 fits.
    const { editor } = await openEditor(doc([text()]), { measure })

    expect(editor.textLayout(text({ height: 20, autoFit: { minFontSize: 10 } })).fontSize).toBe(17)
    expect(editor.textLayout(text()).fontSize).toBe(20)
    expect(editor.textLayout(text()).height).toBeCloseTo(22.6)
  })

  it('is measured by the editor’s measureText, which core functions needing a measure can take', async () => {
    const { editor } = await openEditor(doc([text()]), { measure })
    const font = { family: 'Inter', weight: 400, style: 'normal', size: 20 } as const

    // 'Summer' is 6 characters of 20 / 2 + 2 px.
    expect(editor.measureText(font, 'Summer', 2)).toBe(72)
    // A 70 px Box breaks 'Summer sale' (110 px) into two 22.6 px lines (lineHeight 1).
    expect(selectionBox([text({ x: 5, y: 6, width: 70, lineHeight: 1 })], editor.measureText)!.height).toBeCloseTo(45.2)
  })
})

describe('AutoFit in the Inspector', () => {
  it('turned on for a text without height sets height to its Text Layout height (rounded up) and minFontSize to half the size', async () => {
    // fontSize 25: one line 25 × 1.13 = 28.25 px tall → height 29; minFontSize round(12.5) = 13.
    const original = doc([text({ fontSize: 25 })])
    const { editor, user, toggle, field, changes } = await openInspector(original, { select: ['text-1'], measure })

    expect(toggle('AutoFit').checked).toBe(false)
    expect(screen.queryByRole('textbox', { name: 'Min font size' })).toBeNull()
    await user.click(toggle('AutoFit'))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text({ fontSize: 25, height: 29, autoFit: { minFontSize: 13 } }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(toggle('AutoFit').checked).toBe(true)
    expect(field('Min font size').value).toBe('13')
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('minFontSize never goes below 1', async () => {
    const { editor, user, toggle } = await openInspector(doc([text({ fontSize: 1 })]), { select: ['text-1'], measure })
    await user.click(toggle('AutoFit'))
    await settle()

    // round(0.5) = 1; a 1 px line is 1.13 px tall → height 2.
    expect(editor.getDocument().layers[0]).toEqual(text({ fontSize: 1, height: 2, autoFit: { minFontSize: 1 } }))
  })

  it('keeps a height the text already has; turned off it removes autoFit and keeps the height', async () => {
    const { editor, user, toggle, changes } = await openInspector(doc([text({ height: 80 })]), { select: ['text-1'], measure })
    await user.click(toggle('AutoFit'))
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text({ height: 80, autoFit: { minFontSize: 10 } }))

    await user.click(toggle('AutoFit'))
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text({ height: 80 }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
  })

  it('minFontSize is edited as typed, one step; 0 or less is dropped', async () => {
    const on = text({ height: 20, autoFit: { minFontSize: 10 } })
    const { editor, user, field, changes } = await openInspector(doc([on]), { select: ['text-1'], measure })

    await user.clear(field('Min font size'))
    await user.type(field('Min font size'), '0{Enter}')
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(on)
    await user.clear(field('Min font size'))
    await user.type(field('Min font size'), '18.5{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text({ height: 20, autoFit: { minFontSize: 18.5 } }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
  })

  it('shows beside the declared font size the size used after AutoFit; typing the declared size keeps it the maximum', async () => {
    // A 20 px Box: 20 shrinks to 17 (see above); declared 16 → 16 × 1.13 = 18.08 fits, used 16.
    const { editor, user, field } = await openInspector(doc([text({ height: 20, autoFit: { minFontSize: 10 } })]), {
      select: ['text-1'],
      measure,
    })
    const used = () => screen.getByRole('status', { name: 'Used font size' })

    expect(field('Font size').value).toBe('20')
    expect(used().textContent).toBe('17')
    await user.clear(field('Font size'))
    await user.type(field('Font size'), '16{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toMatchObject({ fontSize: 16 })
    expect(used().textContent).toBe('16')
  })

  it('the used size is not shown without AutoFit', async () => {
    await openInspector(doc([text()]), { select: ['text-1'], measure })
    expect(screen.queryByRole('status', { name: 'Used font size' })).toBeNull()
  })
})

describe('Auto height of a text Layer', () => {
  it('is on without height; turned off it sets the Text Layout height, turned on again it removes height', async () => {
    const original = doc([text()])
    const { editor, user, toggle, field, changes } = await openInspector(original, { select: ['text-1'], measure })

    expect(toggle('Auto height').checked).toBe(true)
    expect(field('Height').placeholder).toBe('Auto')
    await user.click(toggle('Auto height'))
    await settle()
    // 20 × 1.13 = 22.6 → 23.
    expect(editor.getDocument().layers[0]).toEqual(text({ height: 23 }))
    expect(field('Height').value).toBe('23')

    await user.click(toggle('Auto height'))
    await settle()
    expect(editor.getDocument()).toEqual(original)
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
  })

  it('a typed height turns Auto off; Auto comes back only while AutoFit is off', async () => {
    const { editor, user, toggle, field } = await openInspector(doc([text()]), { select: ['text-1'], measure })
    await user.type(field('Height'), '60{Enter}')
    await settle()
    expect(toggle('Auto height').checked).toBe(false)

    await user.click(toggle('AutoFit'))
    await settle()
    expect(toggle('Auto height').disabled).toBe(true)
    await user.click(toggle('AutoFit'))
    await settle()
    await user.click(toggle('Auto height'))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text())
  })

  it('is not offered for a rect', async () => {
    await openInspector(doc([rect()]), { select: ['rect-1'] })
    expect(screen.queryByRole('checkbox', { name: 'Auto height' })).toBeNull()
  })
})
