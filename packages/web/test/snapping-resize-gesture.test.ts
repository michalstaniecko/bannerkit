// Snapping while resizing, and rotating by 15° with Shift, in the editor (jsdom +
// node-canvas): real mouse events on a handle, so Fabric runs its own transform;
// asserted through the Document, `change` and `marks()`.
import type { Editor } from '../src/editor/index.ts'
import type { GroupLayer, Layer, LeafLayer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, gesture, image, openEditor, rect, text, type At } from './editor-harness.ts'

const box = (id: string, x: number, y: number, width = 40, height = 40) => rect({ id, x, y, width, height })
const group = (id: string, layers: Layer[]): GroupLayer => ({ id, type: 'group', layers })

/** Layer `id` anywhere in the shown Document. */
const layerOf = (layers: readonly Layer[], id: string): Layer | undefined => {
  for (const layer of layers) {
    if (layer.id === id) return layer
    const found = layer.type === 'group' ? layerOf(layer.layers, id) : undefined
    if (found) return found
  }
  return undefined
}
const leaf = (editor: Editor, id: string) => layerOf(editor.getDocument().layers, id) as LeafLayer

/** Where `control` of the object showing `id` is now. */
const handle = (editor: Editor, id: string, control: string): At => {
  const point = editor.objectFor(id)!.oCoords[control]!
  return [point.x, point.y]
}

/** Drags from `from` through `path` (distinct points) and releases, with `init` on every event. */
function drag(upper: HTMLCanvasElement, from: At, path: At[], init: MouseEventInit = {}) {
  const g = gesture(upper, from, init)
  for (const at of path) g.move(at)
  g.release()
}

// The 400×300 Canvas holds a target `a` (100..150 × 200..250) and the resized `r` (10..50 × 10..50).
const scene = (r: Layer = box('r', 10, 10)) => doc([box('a', 100, 200, 50, 50), r])

describe('resizing a rect', () => {
  it('its right edge lands on a target, with the snap line in marks() while resizing; one change', async () => {
    const { editor, upper, changes } = await openEditor(scene())
    editor.select(['r'])
    const g = gesture(upper, handle(editor, 'r', 'mr'))
    g.move([80, 30])
    g.move([97, 30]) // right edge 97, 3 px from a's left edge

    expect(editor.marks()).toEqual([{ kind: 'snap-line', axis: 'x', at: 100, from: 10, to: 250, source: 'layer' }])
    g.release()

    expect(leaf(editor, 'r')).toMatchObject({ x: 10, y: 10, width: 90, height: 40 })
    expect(editor.marks()).toEqual([])
    expect(changes.map((c) => c.cause)).toEqual(['transform'])
  })

  it('does not snap with Cmd held, read on every move', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['r'])
    const g = gesture(upper, handle(editor, 'r', 'mr'))
    g.move([80, 30], { metaKey: true })
    g.move([97, 30], { metaKey: true })
    expect(editor.marks()).toEqual([])
    g.release({ metaKey: true })
    expect(leaf(editor, 'r')).toMatchObject({ x: 10, width: 87 })
  })

  it('does not snap after setSnapping(false)', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.setSnapping(false)
    editor.select(['r'])
    drag(upper, handle(editor, 'r', 'mr'), [[80, 30], [97, 30]])
    expect(leaf(editor, 'r')).toMatchObject({ x: 10, width: 87 })
  })

  it('a proportional corner snaps the axis with the nearer target', async () => {
    // Guides at x 100 and y 98: the bottom-right corner dragged to (96, 96), 4 and 2 px off
    const { editor, upper } = await openEditor(doc([box('r', 10, 10)], { guides: { x: [100], y: [98] } }))
    editor.select(['r'])
    drag(upper, handle(editor, 'r', 'br'), [[80, 80], [96, 96]])
    expect(leaf(editor, 'r')).toMatchObject({ x: 10, y: 10, width: 88, height: 88 })
  })

  it('a corner with Shift snaps each axis', async () => {
    const { editor, upper } = await openEditor(doc([box('r', 10, 10)], { guides: { x: [100], y: [140] } }))
    editor.select(['r'])
    drag(upper, handle(editor, 'r', 'br'), [[80, 80], [96, 137]], { shiftKey: true })
    expect(leaf(editor, 'r')).toMatchObject({ x: 10, y: 10, width: 90, height: 130 })
  })

  it('from the centre (Alt), the opposite edge follows symmetrically', async () => {
    // r 10..50 (centre 30): the right edge dragged to 97 snaps onto 100, the left edge to −40
    const { editor, upper } = await openEditor(scene())
    editor.select(['r'])
    drag(upper, handle(editor, 'r', 'mr'), [[80, 30], [97, 30]], { altKey: true })
    expect(leaf(editor, 'r')).toMatchObject({ x: -40, width: 140 })
  })
})

describe('resizing an image contain', () => {
  it('snaps its Box, not the letterboxed picture', async () => {
    // a 40×20 picture in a 40×40 Box (10..50 × 10..50) shows at y 20..40; a Guide at y 110
    const { editor, upper } = await openEditor(doc([image({ id: 'r', x: 10, y: 10, width: 40, height: 40, fit: 'contain' })], { guides: { x: [], y: [110] } }))
    editor.select(['r'])
    drag(upper, handle(editor, 'r', 'mb'), [[30, 60], [30, 78]])
    const r = leaf(editor, 'r')
    expect(r.y + (r as { height: number }).height).toBe(110)
  })
})

describe('resizing a text Layer', () => {
  // the text 200..300 × 10..50
  const scene = () => doc([box('a', 100, 200, 50, 50), text({ id: 'r', x: 200, y: 10, width: 100, height: 40 })])

  it('snaps its left edge', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['r'])
    drag(upper, handle(editor, 'r', 'ml'), [[170, 30], [153, 30]]) // → a's right edge 150
    expect(leaf(editor, 'r')).toMatchObject({ x: 150, width: 150 })
  })

  it('snaps its right and bottom edges', async () => {
    const { editor, upper, changes } = await openEditor(scene())
    editor.select(['r'])
    drag(upper, handle(editor, 'r', 'mr'), [[350, 30], [397, 30]]) // → the Canvas edge 400
    expect(leaf(editor, 'r')).toMatchObject({ x: 200, width: 200 })
    drag(upper, handle(editor, 'r', 'mb'), [[300, 150], [300, 197]]) // → a's top edge 200
    expect(leaf(editor, 'r')).toMatchObject({ y: 10, height: 190 })
    expect(changes.map((c) => c.cause)).toEqual(['transform', 'transform'])
  })
})

describe('what scales without snapping', () => {
  it('a rotated Layer', async () => {
    // r turned 90°: its right handle is at the bottom (30, 50); dragged to y 97 near a Guide at y 100
    const { editor, upper } = await openEditor(doc([rect({ id: 'r', x: 10, y: 10, width: 40, height: 40, rotation: 90 })], { guides: { x: [], y: [100] } }))
    editor.select(['r'])
    drag(upper, handle(editor, 'r', 'mr'), [[30, 80], [30, 97]])
    expect(leaf(editor, 'r')).toMatchObject({ width: 87 })
  })

  it('a Group', async () => {
    const { editor, upper } = await openEditor(doc([group('g', [box('c', 10, 10)])], { guides: { x: [100], y: [100] } }))
    editor.select(['g'])
    drag(upper, handle(editor, 'g', 'br'), [[80, 80], [97, 97]])
    expect(leaf(editor, 'c')).toMatchObject({ width: 87, height: 87 })
  })
})

describe('rotating with Shift', () => {
  // rect() is 100..200 × 100..150, centre (150, 125); (350, 162) is ≈ 100.48° from its handle
  it('turns a Layer by 15° steps, Snapping on or off; one change', async () => {
    for (const snapping of [true, false]) {
      const { editor, upper, changes } = await openEditor(doc([rect()]))
      editor.setSnapping(snapping)
      editor.select(['rect-1'])
      drag(upper, handle(editor, 'rect-1', 'mtr'), [[300, 50], [350, 162]], { shiftKey: true })
      expect(leaf(editor, 'rect-1').rotation).toBe(105)
      expect(changes).toHaveLength(1)
    }
  })

  it('does not round the angle without Shift', async () => {
    const { editor, upper } = await openEditor(doc([rect()]))
    editor.select(['rect-1'])
    drag(upper, handle(editor, 'rect-1', 'mtr'), [[300, 50], [350, 162]])
    expect(leaf(editor, 'rect-1').rotation).toBe(100.5)
  })

  it('turns a Group by 15° steps relative to where it was', async () => {
    // the Group's Box is centred on its rect's centre (150, 125); the rect starts at 10°
    const { editor, upper } = await openEditor(doc([group('g', [rect({ id: 'c', rotation: 10 })])]))
    editor.setSnapping(false)
    editor.select(['g'])
    drag(upper, handle(editor, 'g', 'mtr'), [[300, 50], [350, 162]], { shiftKey: true })
    expect(leaf(editor, 'c').rotation).toBe(115)
  })

  it('turns several Layers by 15° steps', async () => {
    // the Selection 100..200 × 100..250, centre (150, 175)
    const { editor, upper } = await openEditor(doc([rect({ id: 'r1' }), rect({ id: 'r2', y: 200 })]))
    editor.select(['r1', 'r2'])
    const mtr = editor.objectFor('r1')!.group!.oCoords.mtr!
    drag(upper, [mtr.x, mtr.y], [[300, 100], [350, 212]], { shiftKey: true })
    expect([leaf(editor, 'r1').rotation, leaf(editor, 'r2').rotation]).toEqual([105, 105])
  })
})
