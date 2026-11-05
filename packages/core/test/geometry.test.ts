import { describe, expect, it } from 'vitest'
import { applyMatrix, type Box, boxCenter, boxExtent, boxTransform, linearGradientLine } from '../src/index.ts'

function round(line: { x0: number; y0: number; x1: number; y1: number }) {
  const r = (n: number) => Math.round(n * 1000) / 1000 + 0
  return { x0: r(line.x0), y0: r(line.y0), x1: r(line.x1), y1: r(line.y1) }
}

describe('linearGradientLine (CSS angle convention, Box-relative)', () => {
  it('0deg runs bottom to top', () => {
    expect(round(linearGradientLine(0, 200, 100))).toEqual({ x0: 100, y0: 100, x1: 100, y1: 0 })
  })

  it('90deg runs left to right', () => {
    expect(round(linearGradientLine(90, 200, 100))).toEqual({ x0: 0, y0: 50, x1: 200, y1: 50 })
  })

  it('180deg runs top to bottom and 270deg right to left', () => {
    expect(round(linearGradientLine(180, 200, 100))).toEqual({ x0: 100, y0: 0, x1: 100, y1: 100 })
    expect(round(linearGradientLine(270, 200, 100))).toEqual({ x0: 200, y0: 50, x1: 0, y1: 50 })
  })

  it('45deg on a square reaches the corners exactly, like CSS', () => {
    // CSS gradient line length = |w sin a| + |h cos a| = 100·√2, so the ends land on the corners.
    expect(round(linearGradientLine(45, 100, 100))).toEqual({ x0: 0, y0: 100, x1: 100, y1: 0 })
  })

  it('45deg on a wide Box has the CSS line length, centred on the Box', () => {
    // CSS: length = |200·sin45| + |100·cos45| = 150·√2 ≈ 212.132, so the corners hit stops 0 and 1.
    const l = linearGradientLine(45, 200, 100)
    expect(Math.hypot(l.x1 - l.x0, l.y1 - l.y0)).toBeCloseTo(150 * Math.SQRT2, 6)
    expect(l.x0 + l.x1).toBeCloseTo(200, 6)
    expect(l.y0 + l.y1).toBeCloseTo(100, 6)
  })

  it('negative and >360 angles wrap', () => {
    expect(round(linearGradientLine(-90, 200, 100))).toEqual({ x0: 200, y0: 50, x1: 0, y1: 50 })
    expect(round(linearGradientLine(450, 200, 100))).toEqual({ x0: 0, y0: 50, x1: 200, y1: 50 })
  })
})

describe('boxTransform (rotation in degrees around the Box centre)', () => {
  const corners = (box: Box) => {
    const m = boxTransform(box)
    return [
      [0, 0],
      [box.width, 0],
      [box.width, box.height],
      [0, box.height],
    ].map(([x, y]) => {
      const p = applyMatrix(m, x!, y!)
      return [Math.round(p.x * 1000) / 1000 + 0, Math.round(p.y * 1000) / 1000 + 0]
    })
  }

  it('without rotation, Box-local (0,0) is x/y', () => {
    expect(corners({ x: 10, y: 20, width: 100, height: 40 })).toEqual([
      [10, 20],
      [110, 20],
      [110, 60],
      [10, 60],
    ])
  })

  it('90deg turns the Box clockwise about its centre (60, 40)', () => {
    // Top-left swings to the top-right of the rotated footprint: centre (60,40), half size (50,20).
    expect(corners({ x: 10, y: 20, width: 100, height: 40, rotation: 90 })).toEqual([
      [80, -10],
      [80, 90],
      [40, 90],
      [40, -10],
    ])
  })

  it('keeps the centre fixed at any angle', () => {
    const box = { x: 10, y: 20, width: 100, height: 40, rotation: 33 }
    const c = applyMatrix(boxTransform(box), 50, 20)
    expect(c.x).toBeCloseTo(60, 9)
    expect(c.y).toBeCloseTo(40, 9)
    expect(boxCenter(box)).toEqual({ x: 60, y: 40 })
  })
})

describe('boxExtent', () => {
  it('is the Box itself when unrotated, and the rotated corners’ axis-aligned rectangle otherwise', () => {
    expect(boxExtent({ x: 10, y: 20, width: 100, height: 50 })).toEqual({ x: 10, y: 20, width: 100, height: 50 })
    const turned = boxExtent({ x: 10, y: 20, width: 100, height: 50, rotation: 90 })
    // centre (60, 45); a quarter turn swaps width and height around it
    expect([turned.x, turned.y, turned.width, turned.height].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([35, -5, 50, 100])
  })
})
