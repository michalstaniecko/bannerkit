// The Ruler's scale (Snapping module, pure TS): which Canvas px get a label and
// which get a minor tick, at a given zoom.
import { describe, expect, it } from 'vitest'
import { rulerScale, rulerTicks } from '../src/editor/snapping/ruler.ts'

describe('rulerScale', () => {
  // Labels: the smallest of 1, 2, 5, 10, 20, 50, 100… at least 50 screen px apart.
  // Minor ticks: step / 10, / 5 or / 2, the densest at least 5 screen px apart.
  it.each([
    { zoom: 0.1, step: 500, minor: 50 },
    { zoom: 0.25, step: 200, minor: 20 },
    { zoom: 0.5, step: 100, minor: 10 },
    { zoom: 1, step: 50, minor: 5 },
    { zoom: 2, step: 50, minor: 5 },
    { zoom: 3, step: 20, minor: 2 },
    { zoom: 8, step: 10, minor: 1 },
    { zoom: 0.01, step: 5000, minor: 500 },
  ])('at zoom $zoom labels every $step px with a tick every $minor px', ({ zoom, step, minor }) => {
    expect(rulerScale(zoom)).toEqual({ step, minor })
  })

  it('labels exactly 50 screen px apart when a step lands there', () => {
    expect(rulerScale(0.5).step).toBe(100)
    expect(rulerScale(0.4999).step).toBe(200)
  })

  // Minor ticks stay on whole Canvas px, so a small label step is divided less.
  it.each([
    { zoom: 20, step: 5, minor: 1 },
    { zoom: 30, step: 2, minor: 1 },
    { zoom: 60, step: 1, minor: 1 },
  ])('at zoom $zoom divides a $step px step into $minor px ticks', ({ zoom, step, minor }) => {
    expect(rulerScale(zoom)).toEqual({ step, minor })
  })
})

describe('rulerTicks', () => {
  it('lists every minor tick in a range, labelling the multiples of the step', () => {
    const ticks = rulerTicks(-12, 12, 1) // step 50, minor 5
    expect(ticks).toEqual([
      { value: -10, label: false },
      { value: -5, label: false },
      { value: 0, label: true },
      { value: 5, label: false },
      { value: 10, label: false },
    ])
  })

  it('includes the ends of the range and negative labels', () => {
    const labels = rulerTicks(-1000, 1000, 0.1).filter((t) => t.label).map((t) => t.value)
    expect(labels).toEqual([-1000, -500, 0, 500, 1000])
  })
})
