import { describe, expect, it } from 'vitest'
import { ANCHORS, resizeCanvas, type Document, type LeafLayer } from '../src/index.ts'

const doc = (width: number, height: number): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width, height, background: '#ffffff' },
  layers: [
    { id: 'rect-1', type: 'rect', x: 10, y: 20, width: 30, height: 40, fill: '#000' },
    { id: 'text-1', type: 'text', x: -5, y: 7, width: 50, text: 'Hi', fontFamily: 'Inter', fontWeight: 400, fontSize: 12, fill: '#000' },
  ],
})

const positions = (d: Document) => (d.layers as LeafLayer[]).map(({ x, y }) => [x, y])

describe('resizeCanvas', () => {
  it('sets the new Canvas size and keeps Layers put with the top-left Anchor', () => {
    const resized = resizeCanvas(doc(100, 50), { width: 300, height: 80 }, 'top-left')

    expect(resized.canvas).toEqual({ width: 300, height: 80, background: '#ffffff' })
    expect(positions(resized)).toEqual([[10, 20], [-5, 7]])
  })

  // 100x50 → 300x80: the Canvas grows by 200 × 30, so the shift is 0, 100 or 200 across and 0, 15 or 30 down.
  it.each([
    ['top-left', 0, 0],
    ['top', 100, 0],
    ['top-right', 200, 0],
    ['left', 0, 15],
    ['center', 100, 15],
    ['right', 200, 15],
    ['bottom-left', 0, 30],
    ['bottom', 100, 30],
    ['bottom-right', 200, 30],
  ] as const)('growing with the %s Anchor shifts every Layer by (%i, %i)', (anchor, dx, dy) => {
    const resized = resizeCanvas(doc(100, 50), { width: 300, height: 80 }, anchor)

    expect(positions(resized)).toEqual([[10 + dx, 20 + dy], [-5 + dx, 7 + dy]])
  })

  // 300x80 → 100x50: shrinking by 200 × 30 moves Layers up and left, possibly off the Canvas.
  it.each([
    ['top-left', 0, 0],
    ['center', -100, -15],
    ['bottom-right', -200, -30],
  ] as const)('shrinking with the %s Anchor shifts every Layer by (%i, %i)', (anchor, dx, dy) => {
    const resized = resizeCanvas(doc(300, 80), { width: 100, height: 50 }, anchor)

    expect(resized.canvas).toMatchObject({ width: 100, height: 50 })
    expect(positions(resized)).toEqual([[10 + dx, 20 + dy], [-5 + dx, 7 + dy]])
  })

  it('floors an odd difference so the extra pixel goes to the right and bottom edges', () => {
    // Grow by 3 × 1: centre shift is floor(1.5) = 1 and floor(0.5) = 0.
    expect(positions(resizeCanvas(doc(100, 50), { width: 103, height: 51 }, 'center'))[0]).toEqual([11, 20])
    // Shrink by 3 × 1: centre shift is floor(-1.5) = -2 and floor(-0.5) = -1.
    expect(positions(resizeCanvas(doc(100, 50), { width: 97, height: 49 }, 'center'))[0]).toEqual([8, 19])
  })

  it('moves a rotated Layer by the same delta and keeps its size and rotation', () => {
    const original = doc(100, 50)
    original.layers[0] = { ...(original.layers[0] as LeafLayer), rotation: 33 }

    const resized = resizeCanvas(original, { width: 200, height: 150 }, 'bottom-right')

    expect(resized.layers[0]).toEqual({ ...original.layers[0], x: 110, y: 120 })
  })

  it('returns the Document unchanged when the size is the same', () => {
    const original = doc(100, 50)

    for (const anchor of ANCHORS) {
      expect(resizeCanvas(original, { width: 100, height: 50 }, anchor)).toEqual(original)
    }
  })

  it('does not modify the Document it is given', () => {
    const original = doc(100, 50)
    const copy = structuredClone(original)

    resizeCanvas(original, { width: 300, height: 80 }, 'center')

    expect(original).toEqual(copy)
  })

  it.each([
    { width: 0, height: 50 },
    { width: 100, height: -1 },
    { width: 100.5, height: 50 },
    { width: 8193, height: 50 },
    { width: 100, height: 8193 },
  ])('rejects %j, a size outside the Canvas limits', (size) => {
    expect(() => resizeCanvas(doc(100, 50), size, 'top-left')).toThrow()
  })

  it('moves Guides by the same delta as the Layers', () => {
    const guided = { ...doc(100, 50), guides: { x: [0, 50, 100], y: [25] } }

    const resized = resizeCanvas(guided, { width: 300, height: 80 }, 'center')

    expect(resized.guides).toEqual({ x: [100, 150, 200], y: [40] })
    expect(guided.guides).toEqual({ x: [0, 50, 100], y: [25] })
  })

  it('leaves a Document without Guides without Guides', () => {
    expect(resizeCanvas(doc(100, 50), { width: 300, height: 80 }, 'center')).not.toHaveProperty('guides')
  })

  it('accepts the largest Canvas side', () => {
    expect(resizeCanvas(doc(100, 50), { width: 8192, height: 1 }).canvas).toMatchObject({ width: 8192, height: 1 })
  })
})
