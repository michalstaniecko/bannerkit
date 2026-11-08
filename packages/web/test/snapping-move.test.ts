// The Snapping module's move snapping (pure, no Fabric or DOM): a drag of Layers in a
// Document, its Selection Box pulled onto the edges and centres of other Layers, the
// Canvas and Guides.
import type { Document, GroupLayer, Layer, MeasureText, RectLayer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { freeMove, snapMove, startMove } from '../src/editor/snapping/move.ts'

const measure: MeasureText = (font, text) => text.length * font.size * 0.5

const doc = (layers: Layer[], over: Partial<Document> = {}): Document => ({
  version: 2,
  name: 'snap',
  canvas: { width: 400, height: 300, background: null },
  layers,
  ...over,
})

const rect = (id: string, x: number, y: number, width: number, height: number, over: Partial<RectLayer> = {}): RectLayer => ({
  id,
  type: 'rect',
  x,
  y,
  width,
  height,
  fill: '#000000',
  ...over,
})

const group = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

/** The 40×40 Layer dragged in most cases, at the Canvas origin. */
const moving = rect('moving', 0, 0, 40, 40)

/** Drags the Layers `ids` of `document` by `offset` at `zoom`. */
function drag(document: Document, offset: { x: number; y: number }, { zoom = 1, ids = ['moving'] } = {}) {
  const start = startMove(document, ids, measure)
  if (!start) throw new Error('nothing to move')
  return snapMove(start, offset, zoom)
}

describe('snapping onto Layers', () => {
  it('pulls an edge onto another Layer’s edge', () => {
    // left edge 0 + 147 = 147 → a's right edge 150; y 50..90 is near nothing
    expect(drag(doc([rect('a', 100, 200, 50, 50), moving]), { x: 147, y: 50 }).offset).toEqual({ x: 150, y: 50 })
  })

  it('pulls the centre onto another Layer’s edge', () => {
    // centre 78 + 20 = 98 → a's left edge 100
    expect(drag(doc([rect('a', 100, 200, 50, 50), moving]), { x: 78, y: 50 }).offset).toEqual({ x: 80, y: 50 })
  })

  it('draws the snap line from the moved box to the farthest Layer lined up there', () => {
    const document = doc([rect('a', 100, 200, 50, 50), rect('c', 150, 0, 10, 10), moving])
    // moved box 150..190 × 50..90; a's right edge (y 200..250) and c's left edge (y 0..10) at x = 150
    expect(drag(document, { x: 147, y: 50 }).marks).toEqual([{ kind: 'snap-line', axis: 'x', at: 150, from: 0, to: 250, source: 'layer' }])
  })

  it('snaps to a rotated Layer by its axis-aligned extent', () => {
    // 100×20 turned 90° about (150, 110): extent x 140..160, y 60..160
    const document = doc([rect('a', 100, 100, 100, 20, { rotation: 90 }), rect('moving', 0, 0, 30, 30)])
    const result = drag(document, { x: 163, y: 230 })
    expect(result.offset).toEqual({ x: 160, y: 230 })
    expect(result.marks).toEqual([{ kind: 'snap-line', axis: 'x', at: 160, from: 60, to: 260, source: 'layer' }])
  })

  it('moves a rotated Layer by its axis-aligned extent', () => {
    // 100×20 turned 90° about (50, 10): extent x 40..60, y −40..60; its right edge 60 + 89 → a's right edge 150
    const document = doc([rect('a', 100, 200, 50, 50), rect('moving', 0, 0, 100, 20, { rotation: 90 })])
    expect(drag(document, { x: 89, y: 100 }).offset).toEqual({ x: 90, y: 100 })
  })
})

describe('snapping onto the Canvas and Guides', () => {
  it('pulls the centre onto the Canvas centre, the line across the whole Canvas', () => {
    // centre (202, 153) → (200, 150)
    const result = drag(doc([moving]), { x: 182, y: 133 })
    expect(result.offset).toEqual({ x: 180, y: 130 })
    expect(result.marks).toEqual([
      { kind: 'snap-line', axis: 'x', at: 200, from: 0, to: 300, source: 'canvas' },
      { kind: 'snap-line', axis: 'y', at: 150, from: 0, to: 400, source: 'canvas' },
    ])
  })

  it('pulls an edge onto a Guide, the line being the Guide across the Canvas', () => {
    const result = drag(doc([moving], { guides: { x: [250], y: [] } }), { x: 253, y: 50 })
    expect(result.offset).toEqual({ x: 250, y: 50 })
    expect(result.marks).toEqual([{ kind: 'snap-line', axis: 'x', at: 250, from: 0, to: 300, source: 'guide' }])
  })

  it('pulls onto a Guide outside the Canvas', () => {
    expect(drag(doc([moving], { guides: { x: [], y: [-30] } }), { x: 50, y: -68 }).offset).toEqual({ x: 50, y: -70 })
  })
})

describe('threshold', () => {
  // A 200×40 box whose left edge nears a's right edge (550); nothing else is near.
  const wide = doc([rect('a', 500, 0, 50, 50), rect('moving', 0, 0, 200, 40)], { canvas: { width: 1000, height: 1000, background: null } })
  const left = (x: number, zoom: number) => drag(wide, { x, y: 700 }, { zoom }).offset.x

  it.each([
    [1, 6],
    [2, 3],
    [3, 2],
    [0.5, 12],
  ])('at zoom %s snaps within %s Canvas px (6 screen px), inclusive', (zoom, reach) => {
    expect(left(550 - reach, zoom)).toBe(550)
    expect(left(550 + reach, zoom)).toBe(550)
    expect(left(550 - reach - 0.25, zoom)).toBe(Math.round(550 - reach - 0.25))
  })
})

describe('ties and whole pixels', () => {
  it('prefers a Guide to the Canvas at the same distance', () => {
    // left 201.5: Canvas centre 200 and Guide 203 both 1.5 away
    expect(drag(doc([moving], { guides: { x: [203], y: [] } }), { x: 201.5, y: 50 }).offset.x).toBe(203)
  })

  it('prefers the Canvas to a Layer at the same distance', () => {
    // left 198.5: a's right edge 197 and Canvas centre 200 both 1.5 away
    expect(drag(doc([rect('a', 150, 200, 47, 50), moving]), { x: 198.5, y: 50 }).offset.x).toBe(200)
  })

  it('prefers a Guide to a Layer at the same distance', () => {
    // top 51.5: a's top edge 50 and Guide 53 both 1.5 away
    expect(drag(doc([rect('a', 300, 50, 50, 50), moving], { guides: { x: [], y: [53] } }), { x: 100, y: 51.5 }).offset.y).toBe(53)
  })

  it('prefers the nearer target whatever its source', () => {
    // left 197: Guide 192 is 5 away, a's right edge 199 is 2
    expect(drag(doc([rect('a', 150, 200, 49, 50), moving], { guides: { x: [192], y: [] } }), { x: 197, y: 50 }).offset.x).toBe(199)
  })

  it('lands on the whole px nearest a fractional target and still draws its line', () => {
    // a's centre 125.5; box centre 104 + 20 = 124 → offset round(105.5) = 106
    const result = drag(doc([rect('a', 100, 200, 51, 50), moving]), { x: 104, y: 50 })
    expect(result.offset).toEqual({ x: 106, y: 50 })
    expect(result.marks).toEqual([{ kind: 'snap-line', axis: 'x', at: 125.5, from: 50, to: 250, source: 'layer' }])
  })

  it('rounds an offset that snaps to nothing to whole px', () => {
    expect(drag(doc([moving]), { x: 37.4, y: 61.6 })).toEqual({ offset: { x: 37, y: 62 }, marks: [] })
  })

  it('a free move (no snapping) is whole px and draws nothing', () => {
    expect(freeMove({ x: 197.6, y: -0.4 })).toEqual({ offset: { x: 198, y: 0 }, marks: [] })
  })
})

describe('targets', () => {
  it('moves several Layers by their Selection Box and none of them is a target', () => {
    // box 0..100 × 0..40; b's left edge 60 would catch a left edge at 57 if b were a target
    const document = doc([rect('a', 0, 0, 40, 40), rect('b', 60, 0, 40, 40)])
    expect(drag(document, { x: 57, y: 100 }, { ids: ['a', 'b'] }).offset.x).toBe(57)
    // the box's right edge 100 + 97 = 197 → the Canvas centre 200
    expect(drag(document, { x: 97, y: 100 }, { ids: ['a', 'b'] }).offset.x).toBe(100)
  })

  it('a moving Group snaps by the union of its children, which are not targets', () => {
    // Group 0..100 × 0..40; its child b's left edge 60 is no target
    const document = doc([group('g', [rect('a', 0, 0, 40, 40), rect('b', 60, 0, 40, 40)])])
    expect(drag(document, { x: 57, y: 100 }, { ids: ['g'] }).offset.x).toBe(57)
    expect(drag(document, { x: 97, y: 100 }, { ids: ['g'] }).offset.x).toBe(100)
  })

  it('a moving child does not snap to its own Group, but to the other children', () => {
    // Group extent 0..100 (centre 50); b is 60..100
    const document = doc([group('g', [rect('a', 0, 0, 40, 40), rect('b', 60, 0, 40, 40)])])
    // b's left edge 52 would snap to the Group's centre 50, 97 to its right edge 100
    expect(drag(document, { x: -8, y: 100 }, { ids: ['b'] }).offset.x).toBe(-8)
    expect(drag(document, { x: 37, y: 100 }, { ids: ['b'] }).offset.x).toBe(37)
    // b's left edge 43 → a's right edge 40
    expect(drag(document, { x: -17, y: 100 }, { ids: ['b'] }).offset.x).toBe(-20)
  })

  it('a hidden Layer, or one in a hidden Group, is no target; a locked one is', () => {
    const layers = [rect('hidden', 100, 200, 50, 50, { visible: false }), group('g', [rect('in-hidden', 300, 200, 20, 20)], { visible: false }), moving]
    expect(drag(doc(layers), { x: 147, y: 50 }).offset.x).toBe(147)
    expect(drag(doc(layers), { x: 323, y: 50 }).offset.x).toBe(323)
    expect(drag(doc([rect('locked', 100, 200, 50, 50, { locked: true }), moving]), { x: 147, y: 50 }).offset.x).toBe(150)
  })

  it('a Layer sticking out of the Canvas is a target', () => {
    expect(drag(doc([rect('out', 380, 200, 100, 50), moving]), { x: 477, y: 50 }).offset.x).toBe(480)
  })
})
