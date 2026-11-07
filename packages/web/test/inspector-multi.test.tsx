// S2: the Inspector's Properties tab for several selected Layers, rendered with a real
// editor and driven by user-event. Values that differ show "Mixed"; a typed value goes
// to every selected Layer in one undo step; x/y are the Selection Box's.
import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { doc, image, rect } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

const a = rect({ id: 'a', x: 10, y: 20, opacity: 0.5 })
const b = rect({ id: 'b', x: 200, y: 120, width: 60, height: 40, opacity: 0.5, rotation: 30 })

describe('Properties of several Layers', () => {
  it('a value that differs shows Mixed; a shared one shows the value', async () => {
    const { field } = await openInspector(doc([a, b]), { select: ['a', 'b'] })

    expect(field('Rotation').value).toBe('')
    expect(field('Rotation').placeholder).toBe('Mixed')
    expect(field('Opacity').value).toBe('0.5')
  })

  it('typing a value sets it on every selected Layer as one undo step', async () => {
    const original = doc([a, b, rect({ id: 'c' })])
    const { editor, user, field, changes } = await openInspector(original, { select: ['a', 'b'] })

    await user.type(field('Rotation'), '45{Enter}')
    await settle()

    expect(editor.getDocument().layers.map((l) => l.rotation)).toEqual([45, 45, undefined])
    expect(field('Rotation').value).toBe('45')
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(editor.getSelection()).toEqual(['a', 'b'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('the Layer ids show as Mixed', async () => {
    const { view } = await openInspector(doc([a, b]), { select: ['a', 'b'] })

    expect(view.getByLabelText('ID').textContent).toBe('Mixed')
  })

})

describe('the Selection Box', () => {
  // a: 10,20 100×50. b: 60×40 at 200,120 turned 30° → extent ≈ 194.02,107.68 71.96×64.64.
  it('x/y show the top-left of the union of the Layers’ rotated extents', async () => {
    const { field } = await openInspector(doc([a, b]), { select: ['a', 'b'] })

    expect([field('X').value, field('Y').value]).toEqual(['10', '20'])
    expect([field('Width').value, field('Height').value]).toEqual(['256', '152'])
  })

  it('typing x/y moves every Layer by the same delta in one undo step', async () => {
    const original = doc([a, b])
    const { editor, user, field, changes } = await openInspector(original, { select: ['a', 'b'] })

    await user.clear(field('X'))
    await user.type(field('X'), '0{Enter}')
    await user.clear(field('Y'))
    await user.type(field('Y'), '-5{Enter}')
    await settle()

    expect(editor.getDocument().layers.map((l) => [l.x, l.y])).toEqual([
      [0, -5],
      [190, 95],
    ])
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
    await act(() => editor.undo())
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('counts the rotation through boxExtent and moves by whole px', async () => {
    // The Box starts at b's rotated extent (194.02), not at its x (200).
    const { editor, user, field } = await openInspector(doc([b, image({ x: 300, y: 300 })]), { select: ['b', 'image-1'] })

    expect(field('X').value).toBe('194')
    expect(field('Y').value).toBe('108')
    await user.clear(field('X'))
    await user.type(field('X'), '100{Enter}')
    await settle()

    // delta = round(100 − 194.02) = −94
    expect(editor.getDocument().layers.map((l) => l.x)).toEqual([106, 206])
    expect(field('X').value).toBe('100')
  })

  it('width and height are disabled', async () => {
    const { field } = await openInspector(doc([a, b]), { select: ['a', 'b'] })

    expect([field('Width').disabled, field('Height').disabled]).toEqual([true, true])
    expect(field('X').disabled).toBe(false)
  })
})
