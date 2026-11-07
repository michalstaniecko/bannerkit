import { describe, expect, it } from 'vitest'
import { layerExtent, resizeCanvas, validateDocument, type Document, type Layer, type MeasureText } from '../src/index.ts'

const rect = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: 'rect',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  fill: '#000',
  ...over,
})

const group = (id: string, layers: unknown[], over: Record<string, unknown> = {}) => ({ id, type: 'group', layers, ...over })

const v2 = (...layers: unknown[]) => ({
  version: 2,
  name: 'grouped',
  canvas: { width: 100, height: 50, background: '#ffffff' },
  layers,
})

describe('Group validation', () => {
  it('accepts Groups nested to any depth, with every optional field', () => {
    const value = v2(
      rect('rect-1'),
      group('group-1', [rect('rect-2'), group('group-2', [rect('rect-3')])], {
        name: 'Badge',
        visible: true,
        locked: false,
        opacity: 0.5,
      }),
    )

    const result = validateDocument(value)

    expect(result.errors).toEqual([])
    expect(result.document).toEqual(value)
  })

  it('rejects an empty Group', () => {
    const result = validateDocument(v2(group('group-1', [rect('rect-1'), group('group-2', [])])))

    expect(result.errors).toEqual([{ path: 'layers[0].layers[1].layers', message: 'a Group needs at least one Layer' }])
  })

  it('requires ids to be unique across the whole tree', () => {
    const result = validateDocument(v2(rect('a'), group('g', [rect('b'), group('h', [rect('a')])])))

    expect(result.errors).toEqual([
      { path: 'layers[1].layers[1].layers[0].id', message: 'duplicate Layer id "a" (also used by layers[0])' },
    ])
  })

  it('locates issues inside Groups by their path in the tree', () => {
    const text = { id: 't', type: 'text', x: 0, y: 0, width: 10, text: 'Hi', fontFamily: 'Inter', fontWeight: 450, fontSize: 12, fill: '#000' }

    const result = validateDocument(v2(rect('a'), group('g', [rect('b'), text])))

    expect(result.errors.map((e) => e.path)).toEqual(['layers[1].layers[1].fontWeight'])
  })

  it('runs the cross-field rules on children too', () => {
    const text = { id: 't', type: 'text', x: 0, y: 0, width: 10, text: 'Hi', fontFamily: 'Inter', fontWeight: 400, fontSize: 12, fill: '#000', autoFit: { minFontSize: 8 } }

    const result = validateDocument(v2(group('g', [text])))

    expect(result.errors).toEqual([{ path: 'layers[0].layers[0].autoFit', message: 'autoFit requires height' }])
  })

  it('suggests a key for a typo inside a Group, and rejects Box fields on the Group', () => {
    const result = validateDocument(v2(group('g', [rect('a', { fil: '#000' })], { x: 5 })))

    expect(result.errors).toContainEqual({ path: 'layers[0].x', message: 'unknown key "x"' })
    expect(result.errors).toContainEqual({ path: 'layers[0].layers[0].fil', message: 'unknown key "fil"', suggestion: 'fill' })
  })

  it('tells a v1 file with a Group to migrate', () => {
    const result = validateDocument({ ...v2(group('g', [rect('a')])), version: 1 })

    expect(result.errors).toEqual([{ path: 'layers[0].type', message: '"group" requires version: 2; run `bannerkit migrate`' }])
  })
})

/** 5 px per character, so text width is predictable. */
const measure: MeasureText = (_font, text) => text.length * 5

describe('layerExtent', () => {
  it('is the Box of a leaf, rotated around its centre', () => {
    const turned = rect('a', { x: 0, y: 0, width: 20, height: 10, rotation: 90 }) as Layer

    const { x, y, width, height } = layerExtent(turned, measure)

    expect([x, y, width, height].map((n) => Math.round(n * 1e9) / 1e9)).toEqual([5, -5, 10, 20])
  })

  it('bounds every child of a Group, rotated, hidden and nested ones included', () => {
    const text = { id: 't', type: 'text', x: 60, y: 0, width: 30, text: 'Hi', fontFamily: 'Inter', fontWeight: 400, fontSize: 10, lineHeight: 1, fill: '#000' }
    const g = group('g', [
      rect('a', { x: 0, y: 0, width: 20, height: 10, rotation: 90 }),
      rect('b', { x: 40, y: 30, width: 10, height: 10, visible: false }),
      group('h', [text]),
    ]) as Layer

    const extent = layerExtent(g, measure)

    // a: x 5..15, y -5..15; b: x 40..50, y 30..40; text: x 60..90, y 0..11.3 (one 10px line × 1.13)
    expect([extent.x, extent.y, extent.width, extent.height].map((n) => Math.round(n * 1e9) / 1e9)).toEqual([5, -5, 85, 45])
    expect(layerExtent(group('h', [text]) as Layer, measure).height).toBeCloseTo(11.3)
  })
})

describe('resizeCanvas with Groups', () => {
  it('moves every leaf of the tree and leaves Groups without a Box', () => {
    const document = validateDocument(v2(rect('a', { x: 1, y: 2 }), group('g', [rect('b', { x: 3, y: 4 }), group('h', [rect('c', { x: 5, y: 6 })])])))
      .document as Document

    const resized = resizeCanvas(document, { width: 120, height: 70 }, 'bottom-right')

    expect(resized.layers).toEqual([
      rect('a', { x: 21, y: 22 }),
      group('g', [rect('b', { x: 23, y: 24 }), group('h', [rect('c', { x: 25, y: 26 })])]),
    ])
  })
})
