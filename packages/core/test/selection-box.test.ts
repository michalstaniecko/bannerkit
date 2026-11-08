import { describe, expect, it } from 'vitest'
import { selectionBox, type Layer, type MeasureText, type Rect } from '../src/index.ts'

/** 5 px per character, so text width is predictable. */
const measure: MeasureText = (_font, text) => text.length * 5

const rect = (id: string, over: Record<string, unknown> = {}) => ({ id, type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#000', ...over }) as Layer
const group = (id: string, layers: Layer[], over: Record<string, unknown> = {}) => ({ id, type: 'group', layers, ...over }) as Layer
const text = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, type: 'text', x: 0, y: 0, width: 30, text: 'Hi', fontFamily: 'Inter', fontWeight: 400, fontSize: 10, lineHeight: 1, fill: '#000', ...over }) as Layer

const rounded = (r: Rect | undefined) => r && [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 1e9) / 1e9)

describe('selectionBox', () => {
  it('of one Layer is its Box', () => {
    expect(selectionBox([rect('a', { x: 3, y: 4, width: 20, height: 30 })], measure)).toEqual({ x: 3, y: 4, width: 20, height: 30 })
  })

  it('of several Layers is the axis-aligned union of their Boxes', () => {
    const layers = [rect('a', { x: 10, y: 20 }), rect('b', { x: 50, y: 5, width: 20, height: 5 })]

    expect(selectionBox(layers, measure)).toEqual({ x: 10, y: 5, width: 60, height: 25 })
  })

  it('of a rotated Layer is the axis-aligned extent of its rotated Box', () => {
    const turned = rect('a', { x: 0, y: 0, width: 20, height: 10, rotation: 90 })

    expect(rounded(selectionBox([turned], measure))).toEqual([5, -5, 10, 20])
  })

  it('of a text Layer without height takes the height of its Text Layout', () => {
    // "Hello world" (55 px) wraps in a 30 px Box: two 10 px lines × 1.13
    const box = selectionBox([text('t', { x: 7, y: 8, text: 'Hello world' })], measure)

    expect(rounded(box)).toEqual([7, 8, 30, 22.6])
  })

  it('of a Group bounds its children, hidden ones included', () => {
    const g = group('g', [rect('a', { x: 0, y: 0 }), rect('b', { x: 40, y: 30, visible: false })])

    expect(selectionBox([g], measure)).toEqual({ x: 0, y: 0, width: 50, height: 40 })
  })

  it('of a nested Group bounds the children of every level', () => {
    const g = group('g', [rect('a', { x: 0, y: 0 }), group('h', [rect('b', { x: 200, y: 50 }), group('i', [text('t', { x: -10, y: 100 })])])])

    expect(rounded(selectionBox([g], measure))).toEqual([-10, 0, 220, 111.3])
  })

  it('there is none for no Layers', () => {
    expect(selectionBox([], measure)).toBeUndefined()
  })
})
