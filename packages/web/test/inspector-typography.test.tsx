// #13: the Inspector's typography of a text Layer. Each committed change is one undo
// step and one `change` with cause `inspector`; a default value leaves the optional
// key out of the Document. The text itself is still edited on the Canvas.
import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { doc, rect, text } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

describe('letter spacing', () => {
  it('is written as typed in px, one step; 0 leaves the key out', async () => {
    const original = doc([text()])
    const { editor, user, field, changes } = await openInspector(original, { select: ['text-1'] })

    expect(field('Letter spacing').value).toBe('0')
    await user.clear(field('Letter spacing'))
    await user.type(field('Letter spacing'), '-1.5{Enter}')
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text({ letterSpacing: -1.5 }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(editor.getSelection()).toEqual(['text-1'])

    await user.clear(field('Letter spacing'))
    await user.type(field('Letter spacing'), '0{Enter}')
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text())
    await act(() => editor.undo())
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })
})

describe('fill and alignment', () => {
  const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement

  it('fill is a colour only: one step; something that is not a colour is dropped', async () => {
    const { editor, user, field, changes } = await openInspector(doc([text()]), { select: ['text-1'] })

    expect(field('Fill').value).toBe('#111111')
    await user.clear(field('Fill'))
    await user.type(field('Fill'), 'nope{Enter}')
    await user.clear(field('Fill'))
    await user.type(field('Fill'), '#336699{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text({ fill: '#336699' }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
  })

  it('align and vertical align are picked, one step each; the defaults leave the keys out', async () => {
    const original = doc([text()])
    const { editor, user, changes } = await openInspector(original, { select: ['text-1'] })

    expect(select('Align').value).toBe('left')
    expect([...select('Align').options].map((o) => o.value)).toEqual(['left', 'center', 'right'])
    expect(select('Vertical align').value).toBe('top')
    expect([...select('Vertical align').options].map((o) => o.value)).toEqual(['top', 'middle', 'bottom'])
    await user.selectOptions(select('Align'), 'center')
    await settle()
    await user.selectOptions(select('Vertical align'), 'bottom')
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text({ align: 'center', verticalAlign: 'bottom' }))
    await user.selectOptions(select('Align'), 'left')
    await settle()
    await user.selectOptions(select('Vertical align'), 'top')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text())
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector', 'inspector', 'inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument().layers[0]).toEqual(text({ verticalAlign: 'bottom' }))
  })
})

describe('font family and weight', () => {
  const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement

  it('are picked only from the font manifest; a weight is one step', async () => {
    const original = doc([text()])
    const { editor, user, changes } = await openInspector(original, { select: ['text-1'] })

    expect(select('Font family').value).toBe('Inter')
    expect([...select('Font family').options].map((o) => o.value)).toEqual(['Inter'])
    expect(select('Font weight').value).toBe('700')
    expect([...select('Font weight').options].map((o) => o.value)).toEqual(['100', '200', '300', '400', '500', '600', '700', '800', '900'])
    await user.selectOptions(select('Font weight'), '300')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text({ fontWeight: 300 }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('a family not in the manifest shows as itself, marked and not pickable', async () => {
    const original = doc([text({ fontFamily: 'Comic Sans' })])
    const { editor, user, changes } = await openInspector(original, { select: ['text-1'] })

    const family = select('Font family')
    expect(family.value).toBe('Comic Sans')
    expect(family.selectedOptions[0]!.textContent).toBe('Comic Sans (not available)')
    expect(family.selectedOptions[0]!.disabled).toBe(true)
    expect(select('Font weight').value).toBe('700')
    await user.selectOptions(family, 'Inter')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text({ fontFamily: 'Inter' }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
  })
})

describe('a rect and a text together', () => {
  const gradient = { type: 'linear' as const, angle: 90, stops: [['#000000', 0], ['#ffffff', 1]] as [string, number][] }

  it('share one Fill: Mixed when they differ; a colour replaces a gradient', async () => {
    const original = doc([rect({ fill: gradient }), text()])
    const { editor, user, field, changes } = await openInspector(original, { select: ['rect-1', 'text-1'] })

    expect(screen.getAllByRole('textbox', { name: 'Fill' })).toHaveLength(1)
    expect(field('Fill').value).toBe('')
    expect(field('Fill').placeholder).toBe('Mixed')
    expect(screen.queryByRole('textbox', { name: 'Font size' })).toBeNull()
    await user.type(field('Fill'), '#123456{Enter}')
    await settle()

    expect(editor.getDocument().layers).toEqual([rect({ fill: '#123456' }), text({ fill: '#123456' })])
    expect(field('Fill').value).toBe('#123456')
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })
})

describe('font size and line height', () => {
  it('font size is written as typed, one step; 0 or less is dropped', async () => {
    const { editor, user, field, changes } = await openInspector(doc([text()]), { select: ['text-1'] })

    expect(field('Font size').value).toBe('20')
    await user.clear(field('Font size'))
    await user.type(field('Font size'), '0{Enter}')
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text())
    await user.clear(field('Font size'))
    await user.type(field('Font size'), '24.5{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text({ fontSize: 24.5 }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
  })

  it('arrows below the smallest size stop there instead of being dropped', async () => {
    const original = text({ fontSize: 5, lineHeight: 0.05, height: 40, autoFit: { minFontSize: 3 } })
    const { editor, user, field } = await openInspector(doc([original]), { select: ['text-1'] })

    for (const name of ['Font size', 'Line height', 'Min font size']) {
      await user.click(field(name))
      await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
      await settle()
    }

    expect(editor.getDocument().layers[0]).toEqual({ ...original, fontSize: 1, lineHeight: 0.01, autoFit: { minFontSize: 1 } })
  })

  it('line height is a multiplier, 1.16 by default; the default leaves the key out', async () => {
    const { editor, user, field, changes } = await openInspector(doc([text()]), { select: ['text-1'] })

    expect(field('Line height').value).toBe('1.16')
    await user.clear(field('Line height'))
    await user.type(field('Line height'), '1.4{Enter}')
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text({ lineHeight: 1.4 }))
    await user.clear(field('Line height'))
    await user.type(field('Line height'), '1.16{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text())
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
  })
})

describe('italic', () => {
  it('turns italic on and off, one step each; upright leaves the key out', async () => {
    const original = doc([text()])
    const { editor, user, toggle, changes } = await openInspector(original, { select: ['text-1'] })

    expect(toggle('Italic').checked).toBe(false)
    expect(toggle('Italic').disabled).toBe(false)
    await user.click(toggle('Italic'))
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text({ fontStyle: 'italic' }))
    expect(toggle('Italic').checked).toBe(true)

    await user.click(toggle('Italic'))
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text())
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
  })

  it('shows Mixed over upright and italic texts', async () => {
    const { toggle } = await openInspector(doc([text(), text({ id: 'text-2', fontStyle: 'italic' })]), { select: ['text-1', 'text-2'] })

    expect(toggle('Italic').indeterminate).toBe(true)
  })
})

describe('text transform', () => {
  const group = () => screen.getByRole('radiogroup', { name: 'Text transform' })
  const option = (name: string) => screen.getByRole('radio', { name })
  const checked = () =>
    screen
      .getAllByRole('radio')
      .filter((r) => r.getAttribute('aria-checked') === 'true')
      .map((r) => r.getAttribute('aria-label'))

  it('is a segmented choice, one step each; None leaves the key out', async () => {
    const { editor, user, changes } = await openInspector(doc([text()]), { select: ['text-1'] })

    expect(checked()).toEqual(['None'])
    await user.click(option('Uppercase'))
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text({ textTransform: 'uppercase' }))
    expect(checked()).toEqual(['Uppercase'])
    await user.click(option('Lowercase'))
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(text({ textTransform: 'lowercase' }))
    await user.click(option('None'))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text())
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector', 'inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument().layers[0]).toEqual(text({ textTransform: 'lowercase' }))
  })

  it('shows Mixed for several Layers that differ; a pick sets every one', async () => {
    const { editor, user, changes } = await openInspector(doc([text({ id: 'a', textTransform: 'uppercase' }), text({ id: 'b' })]), {
      select: ['a', 'b'],
    })

    expect(checked()).toEqual([])
    expect(group().textContent).toContain('Mixed')
    await user.click(option('None'))
    await settle()

    expect(editor.getDocument().layers).toEqual([text({ id: 'a' }), text({ id: 'b' })])
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(checked()).toEqual(['None'])
  })
})
