// The Snapping module's Guide snapping (pure, no Fabric or DOM): the value of a dragged
// Guide pulled onto the edges and centres of Layers and of the Canvas, never onto
// other Guides, on whole px.
import type { Document, Layer, RectLayer, TextLayer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { guideTargets, snapGuide } from '../src/editor/snapping/guide.ts'

const measure = (font: { size: number }, text: string) => text.length * font.size * 0.5

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

/** A 100×50 Layer at (101, 61): left 101, centre 151, right 201; top 61, middle 86, bottom 111. */
const a = rect('a', 101, 61, 100, 50)

/** Snaps a Guide on `axis` dragged to `raw` in `document` at `zoom`. */
const snap = (document: Document, axis: 'x' | 'y', raw: number, zoom = 1) => snapGuide(guideTargets(document, measure), axis, raw, zoom)

describe('snapping a Guide', () => {
  it.each([
    ['left edge', 'x', 99, 101],
    ['centre', 'x', 154, 151],
    ['right edge', 'x', 205, 201],
    ['top edge', 'y', 58, 61],
    ['middle', 'y', 90, 86],
    ['bottom edge', 'y', 112.4, 111],
  ] as const)('of a Layer: the %s', (_, axis, raw, value) => {
    expect(snap(doc([a]), axis, raw).value).toBe(value)
  })

  it.each([
    ['left edge', 'x', 4, 0],
    ['centre', 'x', 197, 200],
    ['right edge', 'x', 403, 400],
    ['top edge', 'y', -5, 0],
    ['middle', 'y', 146, 150],
    ['bottom edge', 'y', 306, 300],
  ] as const)('of the Canvas: the %s', (_, axis, raw, value) => {
    expect(snap(doc([]), axis, raw).value).toBe(value)
  })

  it('snaps to a selected, locked or rotated Layer by its extent, and to the height of a text Layer without one', () => {
    const turned = rect('turned', 100, 100, 100, 100, { rotation: 45, locked: true })
    // rotated 45°: the extent is 100√2 ≈ 141.4 wide, centred on 150, so its left edge is ≈ 79.3
    expect(snap(doc([turned]), 'x', 82).value).toBe(79)
    const label: TextLayer = { id: 't', type: 'text', x: 10, y: 20, width: 300, text: 'Hi', fontFamily: 'Inter', fontWeight: 400, fontSize: 20, fill: '#000000' }
    // one line, 20 × 1.13 = 22.6 px tall: the bottom at 42.6 lands on 43
    expect(snap(doc([label]), 'y', 46).value).toBe(43)
  })

  it('does not snap to a hidden Layer', () => {
    expect(snap(doc([{ ...a, visible: false }]), 'x', 99).value).toBe(99)
  })

  it('does not snap to other Guides', () => {
    expect(snap(doc([], { guides: { x: [250], y: [120] } }), 'x', 252).value).toBe(252)
    expect(snap(doc([], { guides: { x: [250], y: [120] } }), 'y', 118).value).toBe(118)
  })

  it.each([
    [1, 107, 101],
    [1, 107.1, 107],
    [2, 104, 101],
    [2, 104.1, 104],
    [0.5, 113, 101],
    [0.5, 113.1, 113],
  ])('within 6 screen px, inclusive: at zoom %s, %s snaps to %s', (zoom, raw, value) => {
    expect(snap(doc([a]), 'x', raw, zoom).value).toBe(value)
  })

  it('lands on whole px: unsnapped by rounding, onto a fractional target at its nearest whole px', () => {
    expect(snap(doc([]), 'x', 123.4).value).toBe(123)
    expect(snap(doc([]), 'x', -50.6).value).toBe(-51)
    // the centre of a 101 px wide Layer at 0 is at 50.5
    expect(snap(doc([rect('odd', 0, 200, 101, 20)]), 'x', 53).value).toBe(51)
  })

  it('picks the nearest target; on a tie the Canvas wins over a Layer', () => {
    expect(snap(doc([rect('b', 0, 0, 196, 10)]), 'x', 197.4).value).toBe(196)
    const tie = snap(doc([rect('b', 0, 0, 196, 10)]), 'x', 198)
    expect(tie.value).toBe(200)
    expect(tie.marks).toEqual([{ kind: 'snap-line', axis: 'x', at: 200, from: 0, to: 300, source: 'canvas' }])
  })

  it('marks the targets it lined up with: a Layer along its extent', () => {
    expect(snap(doc([a]), 'x', 99).marks).toEqual([{ kind: 'snap-line', axis: 'x', at: 101, from: 61, to: 111, source: 'layer' }])
    expect(snap(doc([a]), 'x', 300).marks).toEqual([])
  })
})
