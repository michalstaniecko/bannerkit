// S2: a rect's `fill` as a colour or a linear gradient, edited in the Inspector: the
// fill type, the angle and the stops (add, remove, offset, colour). Each change is one
// undo step and one `change` with cause `inspector`. With several Layers the gradient
// editor is there only when every one is a rect.
import type { LinearGradient } from '@bannerkit/core'
import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { doc, rect, text } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

const fillType = () => screen.getByRole('combobox', { name: 'Fill type' }) as HTMLSelectElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

const gradient: LinearGradient = { type: 'linear', angle: 90, stops: [['#000000', 0], ['#ffffff', 1]] }

describe('fill type', () => {
  it('switching a colour fill to a gradient starts from the colour, in one step', async () => {
    const original = doc([rect()])
    const { editor, user, changes } = await openInspector(original, { select: ['rect-1'] })

    expect(fillType().value).toBe('color')
    expect(screen.queryByRole('textbox', { name: 'Angle' })).toBeNull()
    await user.selectOptions(fillType(), 'linear')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(
      rect({ fill: { type: 'linear', angle: 90, stops: [['#ff0000', 0], ['#ffffff', 1]] } }),
    )
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(editor.getSelection()).toEqual(['rect-1'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('switching a gradient to a colour keeps its first stop colour', async () => {
    const { editor, user, changes } = await openInspector(doc([rect({ fill: gradient })]), { select: ['rect-1'] })

    expect(fillType().value).toBe('linear')
    await user.selectOptions(fillType(), 'color')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect({ fill: '#000000' }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
  })
})

describe('the gradient editor', () => {
  it('shows the angle; a typed angle is one step', async () => {
    const original = doc([rect({ fill: gradient })])
    const { editor, user, field, changes } = await openInspector(original, { select: ['rect-1'] })

    expect(field('Angle').value).toBe('90')
    await user.clear(field('Angle'))
    await user.type(field('Angle'), '135{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect({ fill: { ...gradient, angle: 135 } }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('a stop’s colour and offset are each one step; an offset outside 0–1 is dropped', async () => {
    const original = doc([rect({ fill: gradient })])
    const { editor, user, field, changes } = await openInspector(original, { select: ['rect-1'] })

    expect([field('Stop 1 color').value, field('Stop 1 offset').value]).toEqual(['#000000', '0'])
    expect([field('Stop 2 color').value, field('Stop 2 offset').value]).toEqual(['#ffffff', '1'])
    await user.clear(field('Stop 2 color'))
    await user.type(field('Stop 2 color'), '#3366ff{Enter}')
    await user.clear(field('Stop 1 offset'))
    await user.type(field('Stop 1 offset'), '1.5{Enter}')
    await user.clear(field('Stop 1 offset'))
    await user.type(field('Stop 1 offset'), '0.25{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect({ fill: { ...gradient, stops: [['#000000', 0.25], ['#3366ff', 1]] } }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
    await act(() => editor.undo())
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('Add stop puts a stop in the middle of the widest gap, in one step', async () => {
    const { editor, user, changes } = await openInspector(doc([rect({ fill: gradient })]), { select: ['rect-1'] })

    await user.click(button('Add stop'))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(
      rect({ fill: { ...gradient, stops: [['#000000', 0], ['#000000', 0.5], ['#ffffff', 1]] } }),
    )
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(screen.getByRole('textbox', { name: 'Stop 3 offset' })).toBeTruthy()
  })

  it('a stop is removed in one step, never below two stops', async () => {
    const three: LinearGradient = { ...gradient, stops: [['#000000', 0], ['#ff0000', 0.5], ['#ffffff', 1]] }
    const { editor, user, changes } = await openInspector(doc([rect({ fill: three })]), { select: ['rect-1'] })

    expect(button('Remove stop 2').disabled).toBe(false)
    await user.click(button('Remove stop 2'))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect({ fill: gradient }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(button('Remove stop 1').disabled).toBe(true)
    expect(button('Remove stop 2').disabled).toBe(true)
  })
})

describe('several Layers', () => {
  const other: LinearGradient = { type: 'linear', angle: 45, stops: [['#ff0000', 0], ['#0000ff', 1]] }

  it('rects with gradients: Fill is Mixed; the editor sets the angle on each, differing stops are Mixed', async () => {
    const original = doc([rect({ id: 'a', fill: gradient }), rect({ id: 'b', fill: other })])
    const { editor, user, field, changes } = await openInspector(original, { select: ['a', 'b'] })

    expect(field('Fill').placeholder).toBe('Mixed')
    expect(fillType().value).toBe('linear')
    expect(field('Angle').placeholder).toBe('Mixed')
    expect(screen.queryByRole('textbox', { name: 'Stop 1 color' })).toBeNull()
    expect(screen.getByText('Stops: Mixed')).toBeTruthy()

    await user.type(field('Angle'), '180{Enter}')
    await settle()
    expect(editor.getDocument().layers).toEqual([
      rect({ id: 'a', fill: { ...gradient, angle: 180 } }),
      rect({ id: 'b', fill: { ...other, angle: 180 } }),
    ])
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('rects with the same stops edit them together', async () => {
    const { editor, user } = await openInspector(
      doc([rect({ id: 'a', fill: gradient }), rect({ id: 'b', fill: { ...gradient, angle: 0 } })]),
      { select: ['a', 'b'] },
    )

    await user.click(button('Add stop'))
    await settle()
    const stops = [['#000000', 0], ['#000000', 0.5], ['#ffffff', 1]]
    expect(editor.getDocument().layers).toEqual([
      rect({ id: 'a', fill: { ...gradient, stops } as LinearGradient }),
      rect({ id: 'b', fill: { ...gradient, angle: 0, stops } as LinearGradient }),
    ])
  })

  it('a gradient rect and a colour rect: Fill type is Mixed, no gradient editor; picking a type sets it on each', async () => {
    const { editor, user } = await openInspector(doc([rect({ id: 'a', fill: gradient }), rect({ id: 'b' })]), {
      select: ['a', 'b'],
    })

    expect(fillType().value).toBe('')
    expect(screen.queryByRole('textbox', { name: 'Angle' })).toBeNull()
    await user.selectOptions(fillType(), 'color')
    await settle()
    expect(editor.getDocument().layers).toEqual([rect({ id: 'a', fill: '#000000' }), rect({ id: 'b' })])
  })

  it('rect and text: Fill is Mixed, no fill type or gradient editor; a colour replaces the gradient', async () => {
    const original = doc([rect({ fill: gradient }), text()])
    const { editor, user, field, changes } = await openInspector(original, { select: ['rect-1', 'text-1'] })

    expect(field('Fill').value).toBe('')
    expect(field('Fill').placeholder).toBe('Mixed')
    expect(screen.queryByRole('combobox', { name: 'Fill type' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Angle' })).toBeNull()

    await user.type(field('Fill'), '#123456{Enter}')
    await settle()
    expect(editor.getDocument().layers).toEqual([rect({ fill: '#123456' }), text({ fill: '#123456' })])
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })
})
