// The Snapping module's equal gaps (pure, no Fabric or DOM): a drag pulled onto the
// place with equal spaces to its neighbours in its row, and every equal gap marked.
import type { Document, Layer, MeasureText, RectLayer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import type { Mark } from '../src/editor/snapping/marks.ts'
import { snapMove, startMove } from '../src/editor/snapping/move.ts'

const measure: MeasureText = (font, text) => text.length * font.size * 0.5

// A large Canvas, so its edges and centre (0, 500, 1000) stay far from the cases.
const doc = (layers: Layer[]): Document => ({
  version: 2,
  name: 'gaps',
  canvas: { width: 1000, height: 1000, background: null },
  layers,
})

const rect = (id: string, x: number, y: number, width: number, height: number): RectLayer => ({ id, type: 'rect', x, y, width, height, fill: '#000000' })

/** The 40×40 Layer dragged in every case, at the Canvas origin. */
const moving = rect('moving', 0, 0, 40, 40)

function drag(document: Document, offset: { x: number; y: number }, zoom = 1) {
  const start = startMove(document, ['moving'], measure)
  if (!start) throw new Error('nothing to move')
  return snapMove(start, offset, zoom)
}

const gaps = (marks: readonly Mark[]) => marks.filter((m) => m.kind === 'gap')

describe('between two neighbours', () => {
  it('pulls the box to equal gaps between its left and right neighbour on x', () => {
    // a 10..50, c 210..250 in the row y 100..140: the slot 50..210 centres a 40 px box at 110
    const document = doc([rect('a', 10, 100, 40, 40), rect('c', 210, 100, 40, 40), moving])
    const result = drag(document, { x: 107, y: 100 })
    expect(result.offset).toEqual({ x: 110, y: 100 })
    expect(gaps(result.marks)).toEqual([
      { kind: 'gap', axis: 'x', from: 50, to: 110, at: 120, label: '60' },
      { kind: 'gap', axis: 'x', from: 150, to: 210, at: 120, label: '60' },
    ])
  })

  it('pulls the box to equal gaps between its upper and lower neighbour on y', () => {
    // a 10..50, c 210..250 in the column x 100..140: the box centres at y 110
    const document = doc([rect('a', 100, 10, 40, 40), rect('c', 100, 210, 40, 40), moving])
    const result = drag(document, { x: 100, y: 113 })
    expect(result.offset).toEqual({ x: 100, y: 110 })
    expect(gaps(result.marks)).toEqual([
      { kind: 'gap', axis: 'y', from: 50, to: 110, at: 120, label: '60' },
      { kind: 'gap', axis: 'y', from: 150, to: 210, at: 120, label: '60' },
    ])
  })
})

describe('continuing a gap', () => {
  // a 10..50 and c 80..120 in the row y 100..140: a gap of 30
  const pair = () => [rect('a', 10, 100, 40, 40), rect('c', 80, 100, 40, 40)]

  it('repeats the gap to the right of the pair', () => {
    const result = drag(doc([...pair(), moving]), { x: 152, y: 100 })
    expect(result.offset).toEqual({ x: 150, y: 100 })
    expect(gaps(result.marks)).toEqual([
      { kind: 'gap', axis: 'x', from: 50, to: 80, at: 120, label: '30' },
      { kind: 'gap', axis: 'x', from: 120, to: 150, at: 120, label: '30' },
    ])
  })

  it('repeats the gap to the left of the pair', () => {
    // a 310..350, c 380..420: the box ends 30 before a, so starts at 240
    const document = doc([rect('a', 310, 100, 40, 40), rect('c', 380, 100, 40, 40), moving])
    const result = drag(document, { x: 236, y: 100 })
    expect(result.offset).toEqual({ x: 240, y: 100 })
    expect(gaps(result.marks)).toEqual([
      { kind: 'gap', axis: 'x', from: 280, to: 310, at: 120, label: '30' },
      { kind: 'gap', axis: 'x', from: 350, to: 380, at: 120, label: '30' },
    ])
  })

  it('repeats the gap below the pair', () => {
    const document = doc([rect('a', 100, 10, 40, 40), rect('c', 100, 80, 40, 40), moving])
    const result = drag(document, { x: 100, y: 147 })
    expect(result.offset).toEqual({ x: 100, y: 150 })
    expect(gaps(result.marks)).toEqual([
      { kind: 'gap', axis: 'y', from: 50, to: 80, at: 120, label: '30' },
      { kind: 'gap', axis: 'y', from: 120, to: 150, at: 120, label: '30' },
    ])
  })

  it('repeats the gap above the pair', () => {
    const document = doc([rect('a', 100, 310, 40, 40), rect('c', 100, 380, 40, 40), moving])
    const result = drag(document, { x: 100, y: 243 })
    expect(result.offset).toEqual({ x: 100, y: 240 })
    expect(gaps(result.marks)).toEqual([
      { kind: 'gap', axis: 'y', from: 280, to: 310, at: 120, label: '30' },
      { kind: 'gap', axis: 'y', from: 350, to: 380, at: 120, label: '30' },
    ])
  })

  it('only from the nearest neighbour: a Layer between the pair and the box blocks it', () => {
    // e 170..180 sits where the box would continue the gap after c (150..190)
    const document = doc([...pair(), rect('e', 170, 100, 10, 40), moving])
    expect(gaps(drag(document, { x: 152, y: 100 }).marks)).toEqual([])
  })

  it('marks every equal gap in the row, each labelled', () => {
    // a 10..50, c 80..120, e 150..190: two gaps of 30; the box continues them at 220
    const document = doc([...pair(), rect('e', 150, 100, 40, 40), moving])
    const result = drag(document, { x: 223, y: 100 })
    expect(result.offset.x).toBe(220)
    expect(gaps(result.marks).map((m) => [m.from, m.to, m.label])).toEqual([
      [50, 80, '30'],
      [120, 150, '30'],
      [190, 220, '30'],
    ])
  })
})

describe('the row', () => {
  it('ignores Layers that do not overlap the box across the axis', () => {
    // the same pair at y 300..340, while the box is at y 100..140
    const document = doc([rect('a', 10, 300, 40, 40), rect('c', 80, 300, 40, 40), moving])
    const result = drag(document, { x: 152, y: 100 })
    expect(result.offset).toEqual({ x: 152, y: 100 })
    expect(gaps(result.marks)).toEqual([])
  })
})

describe('ties and whole pixels', () => {
  it('a Layer edge wins over an equal gap at the same distance', () => {
    // continuing the gap puts the box at 150; t's left edge 154 is as far from the raw 152
    const document = doc([rect('a', 10, 100, 40, 40), rect('c', 80, 100, 40, 40), rect('t', 154, 400, 40, 40), moving])
    const result = drag(document, { x: 152, y: 100 })
    expect(result.offset.x).toBe(154)
    expect(gaps(result.marks)).toEqual([])
  })

  it('lands on whole px for a fractional gap and still marks it', () => {
    // slot 50..211 minus 40 leaves gaps of 60.5: the box lands at 111, never 110.5
    const document = doc([rect('a', 10, 100, 40, 40), rect('c', 211, 100, 40, 40), moving])
    const result = drag(document, { x: 108, y: 100 })
    expect(result.offset.x).toBe(111)
    expect(gaps(result.marks).map((m) => m.label)).toEqual(['61', '60'])
  })
})
