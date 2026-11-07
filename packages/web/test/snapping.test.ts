// Snapping while moving, in the editor (jsdom + node-canvas): real mouse events on the
// canvas, so Fabric runs its own drag; asserted through the Document, `change`, undo
// and `marks()`.
import type { GroupLayer, Layer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, drag, gesture, key, leaves, openEditor, rect } from './editor-harness.ts'

const box = (id: string, x: number, y: number, width = 40, height = 40) => rect({ id, x, y, width, height })
const group = (id: string, layers: Layer[]): GroupLayer => ({ id, type: 'group', layers })

/** The x of Layer `id` anywhere in the shown Document. */
const xOf = (layers: readonly Layer[], id: string): number | undefined => {
  for (const layer of layers) {
    if (layer.id === id && layer.type !== 'group') return layer.x
    if (layer.type === 'group') {
      const found = xOf(layer.layers, id)
      if (found !== undefined) return found
    }
  }
  return undefined
}

// The 400×300 Canvas holds a target `a` (100..150 × 200..250) and the dragged `b`
// (0..40 × 0..40). Dragging b by (147, 50) puts its left edge 3 px from a's right edge.
const scene = () => doc([box('a', 100, 200, 50, 50), box('b', 0, 0)])

describe('dragging a Layer', () => {
  it('lands on the snapped value, with the snap line in marks() while dragging', async () => {
    const { editor, upper } = await openEditor(scene())
    const g = gesture(upper, [20, 20])
    g.move([90, 45])
    g.move([167, 70])

    expect(editor.marks()).toEqual([{ kind: 'snap-line', axis: 'x', at: 150, from: 50, to: 250, source: 'layer' }])
    g.release()

    expect(leaves(editor.getDocument()).find((l) => l.id === 'b')).toMatchObject({ x: 150, y: 50 })
    expect(editor.marks()).toEqual([])
  })

  it('draws the snap line on the top canvas in the --snap colour, and clears it on release', async () => {
    const container = document.createElement('div')
    container.style.setProperty('--snap', '#00ff00')
    const { upper } = await openEditor(scene(), { container })
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const pixel = (x: number, y: number) => [...upper.getContext('2d')!.getImageData(x, y, 1, 1).data]
    const g = gesture(upper, [20, 20])
    g.move([167, 70])
    await frame()
    // the line x = 150 runs from y 50 to 250; nothing is drawn beside it
    expect(pixel(150, 150)).toEqual([0, 255, 0, 255])
    expect(pixel(152, 150)).toEqual([0, 0, 0, 0])
    g.release()
    await frame()
    expect(pixel(150, 150)).toEqual([0, 0, 0, 0])
  })

  it('does not snap with Cmd held', async () => {
    const { editor, upper } = await openEditor(scene())
    drag(upper, [20, 20], [167, 70], { metaKey: true })
    expect(leaves(editor.getDocument()).find((l) => l.id === 'b')).toMatchObject({ x: 147, y: 50 })
  })

  it('reads Ctrl/Cmd on every move: pressed and released during the gesture', async () => {
    const { editor, upper } = await openEditor(scene())
    const g = gesture(upper, [20, 20])
    g.move([167, 70], { ctrlKey: true })
    expect(editor.marks()).toEqual([])
    g.move([168, 70])
    expect(editor.marks()).toHaveLength(1)
    g.move([167, 71], { metaKey: true })
    g.release({ metaKey: true })
    expect(leaves(editor.getDocument()).find((l) => l.id === 'b')).toMatchObject({ x: 147, y: 51 })
  })

  it('does not snap after setSnapping(false), and snaps again after setSnapping(true)', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.setSnapping(false)
    drag(upper, [20, 20], [167, 70])
    expect(leaves(editor.getDocument()).find((l) => l.id === 'b')).toMatchObject({ x: 147, y: 50 })

    editor.setSnapping(true)
    drag(upper, [167, 70], [170, 70]) // left edge 150 → 150 stays, nothing else near
    drag(upper, [170, 70], [172, 70]) // 152 → back onto a's right edge 150
    expect(leaves(editor.getDocument()).find((l) => l.id === 'b')).toMatchObject({ x: 150 })
  })

  it('one gesture is exactly one change and one undo step', async () => {
    const { editor, upper, changes } = await openEditor(scene())
    drag(upper, [20, 20], [167, 70])

    expect(changes.map((c) => c.cause)).toEqual(['transform'])
    expect(await editor.undo()).toBe(true)
    expect(leaves(editor.getDocument()).find((l) => l.id === 'b')).toMatchObject({ x: 0, y: 0 })
    expect(editor.canUndo()).toBe(false)
  })
})

describe('dragging Groups and several Layers', () => {
  // The target `a` is 310..340 × 200..230: a box dragged by 237 has its right edge 3 px from a's right edge.
  const target = box('a', 310, 200, 30, 30)

  it('a Group snaps by the extent of its Layers', async () => {
    const { editor, upper } = await openEditor(doc([target, group('g', [box('c1', 0, 0), box('c2', 60, 0)])]))
    drag(upper, [20, 20], [257, 120])
    const layers = editor.getDocument().layers
    expect([xOf(layers, 'c1'), xOf(layers, 'c2')]).toEqual([240, 300])
  })

  it('a Layer in a Group does not snap to its own Group', async () => {
    // Group 0..100 (centre 50): c2 (60..100) dragged by −8 would snap its left edge onto 50
    const { editor, upper } = await openEditor(doc([target, group('g', [box('c1', 0, 0), box('c2', 60, 0)])]))
    editor.select(['c2'])
    drag(upper, [80, 20], [72, 120])
    expect(xOf(editor.getDocument().layers, 'c2')).toBe(52)
  })

  it('several selected Layers snap by their Selection Box', async () => {
    const { editor, upper } = await openEditor(doc([target, box('c1', 0, 0), box('c2', 60, 0)]))
    editor.select(['c1', 'c2'])
    drag(upper, [20, 20], [257, 120])
    const layers = editor.getDocument().layers
    expect([xOf(layers, 'c1'), xOf(layers, 'c2')]).toEqual([240, 300])
  })

  it.each([
    // b (x 10.5) moved by 38 lands on 48.5: a Layer is written on whole px, 49 (a fractional
    // offset of 37.5 would have given 48); a Group's Layers keep what they had plus the offset.
    ['a Layer', (b: Layer) => [b], ['b'], 49],
    ['a Group', (b: Layer) => [group('g', [b])], ['g'], 48.5],
    ['several Layers', (b: Layer) => [b, box('c', 100, 0)], ['b', 'c'], 49],
  ] as const)('%s moves by a whole offset when nothing snaps', async (_, layers, selection, x) => {
    // At zoom 2 a pointer move of (75, 51) client px is (37.5, 25.5) Canvas px: the offset is (38, 26).
    const { editor, upper } = await openEditor(doc(layers(rect({ id: 'b', x: 10.5, y: 0, width: 40, height: 40 }))))
    editor.setZoom(2)
    editor.select([...selection])
    drag(upper, [60, 40], [135, 91])
    expect(xOf(editor.getDocument().layers, 'b')).toBe(x)
  })
})

describe('nudging', () => {
  it('moves by exactly 1 px, or 10 px with Shift, even with a target in reach', async () => {
    // b's right edge 40 is 3 px from a's left edge 43
    const { editor } = await openEditor(doc([box('a', 43, 100), box('b', 0, 0)]))
    editor.select(['b'])
    key('ArrowRight')
    expect(xOf(editor.getDocument().layers, 'b')).toBe(1)
    key('ArrowRight', { shiftKey: true })
    expect(xOf(editor.getDocument().layers, 'b')).toBe(11)
    expect(editor.marks()).toEqual([])
  })
})

describe('a reload from disk during a gesture', () => {
  it.each(['apply', 'update'] as const)('through %s ends the gesture and clears marks()', async (how) => {
    const { editor, upper, changes } = await openEditor(scene())
    const g = gesture(upper, [20, 20])
    g.move([167, 70])
    expect(editor.marks()).toHaveLength(1)

    const fromDisk = doc([box('a', 100, 200, 50, 50), box('b', 0, 0), box('new', 300, 0)])
    if (how === 'apply') await editor.apply(fromDisk, { cause: 'reload' })
    else await editor.update(() => fromDisk, { cause: 'reload' })

    expect(editor.marks()).toEqual([])
    expect(editor.getSelection()).toEqual([])
    g.move([200, 100])
    g.release()
    expect(changes.map((c) => c.cause)).toEqual(['reload'])
    expect(editor.getDocument()).toEqual(fromDisk)
  })
})
