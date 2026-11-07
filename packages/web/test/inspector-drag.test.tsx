// S3: dragging the label of a number field in the Inspector (jsdom + node-canvas, real
// mouse events). The Canvas previews every value; only the release is a step: one
// undo step, one `change` (so one autosave). Escape and a reload from disk end it.
import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { doc, rect } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

type Mouse = { clientX: number; shiftKey?: boolean }

/** Dispatches one real mouse event (`buttons` held except on `mouseup`) and lets the editor settle. */
async function mouse(target: EventTarget, type: 'mousedown' | 'mousemove' | 'mouseup', { clientX, shiftKey = false }: Mouse) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 10, shiftKey, button: 0, buttons: type === 'mouseup' ? 0 : 1 }))
    await settle()
  })
}

async function key(key: string) {
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await settle()
  })
}

const labelOf = (input: HTMLInputElement) => input.labels![0]!

describe('dragging a number field label', () => {
  it('dragging the Document Width label previews the resize and commits one resize step', async () => {
    const { editor, field, changes } = await openInspector(doc([rect()]))
    const label = labelOf(field('Width'))

    await mouse(label, 'mousedown', { clientX: 50 })
    await mouse(document.body, 'mousemove', { clientX: 60 })
    await mouse(document.body, 'mousemove', { clientX: 70 })
    expect(editor.getDocument().canvas.width).toBe(420)
    expect(changes).toEqual([])
    await mouse(document.body, 'mouseup', { clientX: 70 })

    expect(changes.map((c) => c.cause)).toEqual(['resize'])
    expect(changes[0]!.document.canvas).toMatchObject({ width: 420, height: 300 })
    expect(changes[0]!.document.layers[0]).toMatchObject({ x: 100, width: 100 })
  })

  it('previews each value on the Canvas and makes the release one step and one change', async () => {
    const original = doc([rect()])
    const { editor, field, changes } = await openInspector(original, { select: ['rect-1'] })
    const label = labelOf(field('X'))

    await mouse(label, 'mousedown', { clientX: 50 })
    await mouse(document.body, 'mousemove', { clientX: 60 })
    await mouse(document.body, 'mousemove', { clientX: 80 })

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 130, y: 100 })
    expect(field('X').value).toBe('130')
    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)

    await mouse(document.body, 'mouseup', { clientX: 80 })

    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([['inspector', ['rect-1']]])
    expect(changes[0]!.document.layers[0]).toMatchObject({ x: 130 })
    expect(field('X').value).toBe('130')
    expect(editor.getSelection()).toEqual(['rect-1'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
    expect(editor.canUndo()).toBe(false)
  })

  it('moves by the field step per px, ×10 with Shift, within the schema range', async () => {
    const { editor, field } = await openInspector(doc([rect({ opacity: 0.5 })]), { select: ['rect-1'] })

    await mouse(labelOf(field('Opacity')), 'mousedown', { clientX: 50 })
    await mouse(document.body, 'mousemove', { clientX: 53 })
    expect(field('Opacity').value).toBe('0.53')
    await mouse(document.body, 'mousemove', { clientX: 53, shiftKey: true })
    expect(field('Opacity').value).toBe('0.8')
    await mouse(document.body, 'mousemove', { clientX: 60, shiftKey: true })
    expect(field('Opacity').value).toBe('1')
    await mouse(document.body, 'mouseup', { clientX: 60 })

    expect(editor.getDocument().layers[0]!.opacity).toBeUndefined() // 1 is the default
  })

  it('Escape during the drag shows the value from before it again, without a step', async () => {
    const original = doc([rect()])
    const { editor, field, changes } = await openInspector(original, { select: ['rect-1'] })

    await mouse(labelOf(field('Width')), 'mousedown', { clientX: 50 })
    await mouse(document.body, 'mousemove', { clientX: 90 })
    await key('Escape')
    await mouse(document.body, 'mousemove', { clientX: 120 })
    await mouse(document.body, 'mouseup', { clientX: 120 })

    expect(editor.getDocument()).toEqual(original)
    expect(field('Width').value).toBe('100')
    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })

  it('releasing where it started records nothing', async () => {
    const { editor, field, changes } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    await mouse(labelOf(field('Y')), 'mousedown', { clientX: 50 })
    await mouse(document.body, 'mousemove', { clientX: 70 })
    await mouse(document.body, 'mousemove', { clientX: 50 })
    await mouse(document.body, 'mouseup', { clientX: 50 })

    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })

  it('a reload from disk during the drag ends it and shows the reloaded value', async () => {
    const { editor, field, changes } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    await mouse(labelOf(field('X')), 'mousedown', { clientX: 50 })
    await mouse(document.body, 'mousemove', { clientX: 70 })
    await act(() => editor.update(() => doc([rect({ y: 40 })]), { cause: 'reload' }))
    expect(field('X').value).toBe('100')
    await mouse(document.body, 'mousemove', { clientX: 90 })
    await mouse(document.body, 'mouseup', { clientX: 90 })

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 40 })
    expect(field('X').value).toBe('100')
    expect(changes.map((c) => c.cause)).toEqual(['reload'])
  })
})

describe('dragging a number field label with several Layers', () => {
  const a = rect({ id: 'a', x: 10, y: 20, opacity: 0.5 })
  const b = rect({ id: 'b', x: 200, y: 120, opacity: 0.5 })

  it('dragging X moves the Selection Box: every Layer by one delta, one step on release', async () => {
    const original = doc([a, b, rect({ id: 'c' })])
    const { editor, field, changes } = await openInspector(original, { select: ['a', 'b'] })

    await mouse(labelOf(field('X')), 'mousedown', { clientX: 50 })
    await mouse(document.body, 'mousemove', { clientX: 60 })
    await mouse(document.body, 'mousemove', { clientX: 75 })

    expect(editor.getDocument().layers.map((l) => l.x)).toEqual([35, 225, 100])
    expect(field('X').value).toBe('35')
    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)

    await mouse(document.body, 'mouseup', { clientX: 75 })

    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(editor.getDocument().layers.map((l) => [l.x, l.y])).toEqual([
      [35, 20],
      [225, 120],
      [100, 100],
    ])
    expect(field('X').value).toBe('35')
    expect(editor.getSelection()).toEqual(['a', 'b'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('dragging a shared field sets it on every Layer; Escape restores them all', async () => {
    const original = doc([a, b])
    const { editor, field, changes } = await openInspector(original, { select: ['a', 'b'] })

    await mouse(labelOf(field('Opacity')), 'mousedown', { clientX: 50 })
    await mouse(document.body, 'mousemove', { clientX: 60 })
    expect(editor.getDocument().layers.map((l) => l.opacity)).toEqual([0.6, 0.6])
    await key('Escape')
    await mouse(document.body, 'mouseup', { clientX: 60 })

    expect(editor.getDocument()).toEqual(original)
    expect(field('Opacity').value).toBe('0.5')
    expect(changes).toEqual([])
  })
})
