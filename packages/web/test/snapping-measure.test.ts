// Measurement in the Snapping module (pure, no Fabric or DOM): `measure(a, b)` gives the
// distances in px between a Selection Box `a` and a box `b` (a Layer's extent or the
// Canvas), as Marks in Canvas coordinates.
import type { Rect } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { formatDistance, measure } from '../src/editor/snapping/measure.ts'

const box = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })

describe('measure', () => {
  it('gives one distance per axis between the facing edges of boxes apart in both axes', () => {
    // a 0..40 × 0..40; b 100..140 × 60..100: 60 px right of a, 20 px below it
    expect(measure(box(0, 0, 40, 40), box(100, 60, 40, 40))).toEqual([
      { kind: 'measure', axis: 'x', at: 20, from: 40, to: 100, label: '60', extension: { at: 100, from: 20, to: 60 } },
      { kind: 'measure', axis: 'y', at: 20, from: 40, to: 60, label: '20', extension: { at: 60, from: 20, to: 100 } },
    ])
  })

  it('measures boxes apart the other way round (b before a) between their facing edges', () => {
    // b 0..20 × 0..100 sits 30 px left of a 50..90, sharing y 10..50 (middle 30)
    expect(measure(box(50, 10, 40, 40), box(0, 0, 20, 100))).toEqual([{ kind: 'measure', axis: 'x', at: 30, from: 20, to: 50, label: '30' }, expect.objectContaining({ axis: 'y' }), expect.objectContaining({ axis: 'y' })])
  })

  it('gives the distances between same-side edges of partly overlapping boxes, across the middle of what they share', () => {
    // a 0..100 × 0..100; b 60..160 × 40..140: shared x 60..100 (middle 80), y 40..100 (middle 70)
    expect(measure(box(0, 0, 100, 100), box(60, 40, 100, 100))).toEqual([
      { kind: 'measure', axis: 'x', at: 70, from: 0, to: 60, label: '60' },
      { kind: 'measure', axis: 'x', at: 70, from: 100, to: 160, label: '60' },
      { kind: 'measure', axis: 'y', at: 80, from: 0, to: 40, label: '40' },
      { kind: 'measure', axis: 'y', at: 80, from: 100, to: 140, label: '40' },
    ])
  })

  it('measures a box inside another from each side, leaving zeros out', () => {
    // a 100..200 × 50..80 inside the Canvas 0..400 × 0..300
    expect(measure(box(100, 50, 100, 30), box(0, 0, 400, 300))).toEqual([
      { kind: 'measure', axis: 'x', at: 65, from: 0, to: 100, label: '100' },
      { kind: 'measure', axis: 'x', at: 65, from: 200, to: 400, label: '200' },
      { kind: 'measure', axis: 'y', at: 150, from: 0, to: 50, label: '50' },
      { kind: 'measure', axis: 'y', at: 150, from: 80, to: 300, label: '220' },
    ])
    // a flush with the left and top edges of b: no 0 distances
    expect(measure(box(0, 0, 100, 30), box(0, 0, 400, 300))).toEqual([
      { kind: 'measure', axis: 'x', at: 15, from: 100, to: 400, label: '300' },
      { kind: 'measure', axis: 'y', at: 50, from: 30, to: 300, label: '270' },
    ])
  })

  it('draws across the middle of a with a dashed extension to b when they share nothing on the other axis', () => {
    // a 0..100 × 0..20 and b 50..150 × 60..80 overlap in x, are apart in y
    expect(measure(box(0, 0, 100, 20), box(50, 60, 100, 20))).toEqual([
      { kind: 'measure', axis: 'x', at: 10, from: 0, to: 50, label: '50', extension: { at: 50, from: 10, to: 60 } },
      { kind: 'measure', axis: 'x', at: 10, from: 100, to: 150, label: '50', extension: { at: 150, from: 10, to: 60 } },
      { kind: 'measure', axis: 'y', at: 75, from: 20, to: 60, label: '40' },
    ])
    // b above a: the extension runs up to b's bottom edge
    expect(measure(box(0, 100, 20, 20), box(50, 0, 10, 10))[0]).toEqual({ kind: 'measure', axis: 'x', at: 110, from: 20, to: 50, label: '30', extension: { at: 50, from: 10, to: 110 } })
  })

  it('labels distances to 0.1 px without a trailing .0', () => {
    expect(measure(box(0, 0, 10.25, 10), box(22.75, 0, 10, 10))[0]?.label).toBe('12.5')
    expect(formatDistance(12)).toBe('12')
    expect(formatDistance(12.5)).toBe('12.5')
    expect(formatDistance(12.04)).toBe('12')
    expect(formatDistance(12.96)).toBe('13')
    expect(formatDistance(0.34)).toBe('0.3')
  })
})
