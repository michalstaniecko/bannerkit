// The Snapping module's resize snapping (pure, no Fabric or DOM): the dragged edge of
// one unrotated Layer's Box pulled onto the edges and centres of other Layers, the
// Canvas and Guides.
import type { Document, Layer, MeasureText, Rect, RectLayer, TextLayer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { snapResize, startResize, type ResizeHandle } from '../src/editor/snapping/resize.ts'

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

const box = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })

/** The target `a` (100..150 × 200..250) and the resized `r` (10..50 × 10..50). */
const scene = (over: Partial<Document> = {}) => doc([rect('a', 100, 200, 50, 50), rect('r', 10, 10, 40, 40)], over)

/** Resizes `r` of `document` to the raw Box `raw`, dragged by `handle`, at `zoom`. */
function resize(document: Document, raw: Rect, handle: ResizeHandle, zoom = 1) {
  const start = startResize(document, 'r', measure)
  if (!start) throw new Error('nothing to resize')
  return snapResize(start, raw, handle, zoom)
}

describe('a side handle', () => {
  it('pulls the dragged edge onto a target, the opposite edge staying', () => {
    // right edge 10 + 87 = 97 → a's left edge 100
    expect(resize(scene(), box(10, 10, 87, 40), { x: 'end' }).box).toEqual(box(10, 10, 90, 40))
  })

  it('pulls a dragged start edge, the end edge staying', () => {
    // r below a: its top edge 254 → a's bottom edge 250
    const document = doc([rect('a', 100, 200, 50, 50), rect('r', 10, 260, 40, 30)])
    expect(resize(document, box(10, 254, 40, 36), { y: 'start' }).box).toEqual(box(10, 250, 40, 40))
  })

  it('lands a fractional target on the nearest whole px', () => {
    // a 100..150.6: right edge 147 → 150.6 → 151
    const document = doc([rect('a', 100, 200, 50.6, 50), rect('r', 10, 10, 40, 40)])
    expect(resize(document, box(10, 10, 137, 40), { x: 'end' }).box).toEqual(box(10, 10, 141, 40))
  })

  it('snaps within 6 screen px at every zoom, inclusive, and not beyond', () => {
    // right edge 10 + width; a's left edge at 100
    expect(resize(scene(), box(10, 10, 84, 40), { x: 'end' }).box.width).toBe(90) // 6 px at zoom 1
    expect(resize(scene(), box(10, 10, 83.9, 40), { x: 'end' }).box.width).toBe(83.9)
    expect(resize(scene(), box(10, 10, 87, 40), { x: 'end' }, 2).box.width).toBe(90) // 3 Canvas px at zoom 2
    expect(resize(scene(), box(10, 10, 86.9, 40), { x: 'end' }, 2).box.width).toBe(86.9)
    expect(resize(scene(), box(10, 10, 78, 40), { x: 'end' }, 0.5).box.width).toBe(90) // 12 Canvas px at zoom 0.5
  })

  it('draws the snap line from the resized Box to the farthest Layer lined up there', () => {
    // right edge → 100; a spans y 200..250, the Box 10..50
    expect(resize(scene(), box(10, 10, 87, 40), { x: 'end' }).marks).toEqual([{ kind: 'snap-line', axis: 'x', at: 100, from: 10, to: 250, source: 'layer' }])
  })

  it('draws a Guide line across the Canvas; a Guide beats a farther Canvas line', () => {
    const document = scene({ guides: { x: [], y: [148] } })
    // bottom edge 145 → the Guide at 148, not the Canvas centre at 150
    expect(resize(document, box(10, 10, 40, 135), { y: 'end' }).marks).toEqual([{ kind: 'snap-line', axis: 'y', at: 148, from: 0, to: 400, source: 'guide' }])
  })

  it('does not snap or draw when nothing is near', () => {
    expect(resize(scene(), box(10, 10, 70, 40), { x: 'end' })).toEqual({ box: box(10, 10, 70, 40), marks: [] })
  })
})

describe('a corner handle', () => {
  // r is 10..50 × 10..30 (2:1); Guides at x 100 and at y `y`
  const corner = (y: number) => doc([rect('r', 10, 10, 40, 20)], { guides: { x: [100], y: [y] } })

  it('proportional: snaps the axis with the nearer target, the other following the proportion', () => {
    // right 96 is 4 from 100, bottom 53 is 3 from 56: y snaps, 46 high, so 92 wide
    const snap = resize(corner(56), box(10, 10, 86, 43), { x: 'end', y: 'end', proportional: true })
    expect(snap.box).toEqual(box(10, 10, 92, 46))
    expect(snap.marks).toEqual([{ kind: 'snap-line', axis: 'y', at: 56, from: 0, to: 400, source: 'guide' }])

    // bottom 53 is 5 from 58: x snaps, 90 wide, so 45 high
    expect(resize(corner(58), box(10, 10, 86, 43), { x: 'end', y: 'end', proportional: true }).box).toEqual(box(10, 10, 90, 45))
  })

  it('proportional from the top-left corner keeps the bottom-right corner', () => {
    // r 110..150 × 110..130, dragged out to 96..150 × 103..130 (54×27): left 96 is 4 from the Guide at 100
    const document = doc([rect('r', 110, 110, 40, 20)], { guides: { x: [100], y: [] } })
    expect(resize(document, box(96, 103, 54, 27), { x: 'start', y: 'start', proportional: true }).box).toEqual(box(100, 105, 50, 25))
  })

  it('free (Shift): snaps each axis on its own', () => {
    // right 97 → a's left edge 100; bottom 145 → the Canvas centre 150
    expect(resize(scene(), box(10, 10, 87, 135), { x: 'end', y: 'end' }).box).toEqual(box(10, 10, 90, 140))
  })
})

describe('resizing from the centre (Alt)', () => {
  it('snaps the dragged edge, the opposite edge following symmetrically', () => {
    // r 10..50 (centre 30) dragged out to −37..97: right edge → 100, left edge → −40
    expect(resize(scene(), box(-37, 10, 134, 40), { x: 'end', centred: true }).box).toEqual(box(-40, 10, 140, 40))
  })

  it('proportional: the other axis grows about the centre too', () => {
    // r 10..50 × 10..30 (centre 30, 20), dragged to −36..96 × −13..53: right 96 → 100, 140 wide, so 70 high
    const document = doc([rect('r', 10, 10, 40, 20)], { guides: { x: [100], y: [] } })
    expect(resize(document, box(-36, -13, 132, 66), { x: 'end', y: 'end', proportional: true, centred: true }).box).toEqual(box(-40, -15, 140, 70))
  })
})

describe('what resizes with snapping', () => {
  it('a text Layer snaps its left, right and bottom edges', () => {
    // the text 160..200 × 10..30, right of a (100..150 × 200..250)
    const text: TextLayer = { id: 'r', type: 'text', x: 160, y: 10, width: 40, height: 20, text: 'Hi', fontFamily: 'Inter', fontWeight: 400, fontSize: 10, fill: '#000000' }
    const start = startResize(doc([rect('a', 100, 200, 50, 50), text]), 'r', measure)!
    expect(snapResize(start, box(153, 10, 47, 20), { x: 'start' }, 1).box).toEqual(box(150, 10, 50, 20)) // → a's right edge
    expect(snapResize(start, box(160, 10, 37, 20), { x: 'end' }, 1).box).toEqual(box(160, 10, 40, 20)) // → the Canvas centre
    expect(snapResize(start, box(160, 10, 40, 187), { y: 'end' }, 1).box).toEqual(box(160, 10, 40, 190)) // → a's top edge
  })

  it('a rotated Layer and a Group do not snap', () => {
    const document = doc([rect('r', 10, 10, 40, 40, { rotation: 30 }), { id: 'g', type: 'group', layers: [rect('c', 0, 0, 10, 10)] }])
    expect(startResize(document, 'r', measure)).toBeUndefined()
    expect(startResize(document, 'g', measure)).toBeUndefined()
  })
})
