import { describe, expect, it } from 'vitest'
import { alignLayers, distributeLayers, findLayer, validateDocument, type Document, type Layer, type MeasureText } from '../src/index.ts'

/** 5 px per character, so text width is predictable. */
const measure: MeasureText = (_font, text) => text.length * 5

const rect = (id: string, x: number, y: number, over: Record<string, unknown> = {}) =>
  ({ id, type: 'rect', x, y, width: 10, height: 10, fill: '#000', ...over }) as Layer
const group = (id: string, layers: Layer[]) => ({ id, type: 'group', layers }) as Layer

const doc = (...layers: Layer[]): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width: 100, height: 50, background: '#ffffff' },
  layers,
})

/** The Document after a successful operation, which must also be valid. */
function ok<R extends { ok: boolean }>(result: R): Extract<R, { ok: true }> & { document: Document } {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`)
  const done = result as Extract<R, { ok: true }> & { document: Document }
  expect(validateDocument(done.document).errors).toEqual([])
  return done
}

/** `[x, y]` of Layer `id` in `document`. */
const at = (document: Document, id: string) => {
  const layer = findLayer(document, id)!.layer as { x: number; y: number }
  return [layer.x, layer.y]
}

describe('alignLayers', () => {
  it('aligns one Layer to the Canvas by each edge', () => {
    const document = doc(rect('a', 33, 17))

    const cases = [
      ['left', [0, 17]],
      ['hcenter', [45, 17]],
      ['right', [90, 17]],
      ['top', [33, 0]],
      ['vcenter', [33, 20]],
      ['bottom', [33, 40]],
    ] as const
    for (const [edge, expected] of cases) {
      expect(at(ok(alignLayers(document, ['a'], [edge], measure)).document, 'a'), edge).toEqual(expected)
    }
  })

  it('aligns on both axes at once, centring on the Canvas', () => {
    const result = ok(alignLayers(doc(rect('a', 3, 4)), ['a'], ['hcenter', 'vcenter'], measure))

    expect(at(result.document, 'a')).toEqual([45, 20])
    expect(result.moved).toEqual(['a'])
  })

  it('aligns several Layers to their Selection Box by default', () => {
    const document = doc(rect('a', 10, 5), rect('b', 40, 30, { width: 20 }), rect('c', 25, 12))

    const left = ok(alignLayers(document, ['a', 'b', 'c'], ['left'], measure)).document
    const bottom = ok(alignLayers(document, ['a', 'b', 'c'], ['bottom'], measure)).document

    expect(['a', 'b', 'c'].map((id) => at(left, id))).toEqual([[10, 5], [10, 30], [10, 12]])
    expect(['a', 'b', 'c'].map((id) => at(bottom, id))).toEqual([[10, 30], [40, 30], [25, 30]])
  })

  it("with to: 'canvas' aligns each of several Layers to the Canvas on its own", () => {
    const document = doc(rect('a', 10, 5), rect('b', 40, 30, { width: 20 }))

    const result = ok(alignLayers(document, ['a', 'b'], ['right'], measure, { to: 'canvas' })).document

    expect([at(result, 'a'), at(result, 'b')]).toEqual([[90, 5], [80, 30]])
  })

  it('moves a Group as one Layer, all its leaves by the same delta', () => {
    const document = doc(group('g', [rect('a', 10, 5), rect('b', 30, 20)]), rect('c', 60, 40))

    const result = ok(alignLayers(document, ['g', 'c'], ['top'], measure))

    expect([at(result.document, 'a'), at(result.document, 'b'), at(result.document, 'c')]).toEqual([[10, 5], [30, 20], [60, 5]])
    expect(result.moved).toEqual(['c'])
    const right = ok(alignLayers(document, ['g'], ['right'], measure)).document
    expect([at(right, 'a'), at(right, 'b')]).toEqual([[70, 5], [90, 20]])
  })

  it('aligns a Layer inside a Group to the Canvas, not to its Group', () => {
    const document = doc(group('g', [rect('a', 10, 5), rect('b', 30, 20)]))

    const result = ok(alignLayers(document, ['b'], ['left'], measure)).document

    expect([at(result, 'a'), at(result, 'b')]).toEqual([[10, 5], [0, 20]])
  })

  it('aligns a rotated Layer by its rotated extent and keeps its rotation', () => {
    // 20×10 turned 90° about its centre (10, 5): its extent is x 5..15, y -5..15
    const document = doc(rect('a', 0, 0, { width: 20, height: 10, rotation: 90 }))

    const result = ok(alignLayers(document, ['a'], ['left', 'top'], measure)).document

    expect(findLayer(result, 'a')!.layer).toMatchObject({ x: -5, y: 5, rotation: 90 })
  })

  it('aligns a text Layer without height by its Text Layout height', () => {
    // "Hello world" (55 px) wraps in a 30 px Box: two 10 px lines × 1.13 = 22.6 px
    const text = {
      id: 't', type: 'text', x: 0, y: 0, width: 30, text: 'Hello world',
      fontFamily: 'Inter', fontWeight: 400, fontSize: 10, lineHeight: 1, fill: '#000',
    } as Layer

    const result = ok(alignLayers(doc(text), ['t'], ['bottom'], measure)).document

    expect(at(result, 't')).toEqual([0, 27])
  })

  it('aligns Layers with different parents together', () => {
    const document = doc(rect('a', 10, 5), group('g', [rect('b', 40, 30)]))

    const result = ok(alignLayers(document, ['b', 'a'], ['vcenter'], measure)).document

    expect([at(result, 'a'), at(result, 'b')]).toEqual([[10, 18], [40, 18]])
  })

  it('rounds each delta to whole pixels', () => {
    // centre of the Canvas is 50; a 15 px wide Layer would need x = 42.5
    const document = doc(rect('a', 0, 0, { width: 15 }), rect('b', 0.3, 0))

    const centred = ok(alignLayers(document, ['a'], ['hcenter'], measure)).document
    const left = ok(alignLayers(document, ['b'], ['left'], measure))

    expect(at(centred, 'a')).toEqual([43, 0])
    expect(at(left.document, 'b')).toEqual([0.3, 0])
    expect(left.moved).toEqual([])
  })

  it('answers the moved ids in input order and leaves still Layers untouched', () => {
    const document = doc(rect('a', 0, 0), rect('b', 0, 20), rect('c', 30, 5))

    const result = ok(alignLayers(document, ['c', 'b', 'a'], ['top'], measure))

    expect(result.moved).toEqual(['c', 'b'])
    expect(findLayer(result.document, 'a')!.layer).toBe(findLayer(document, 'a')!.layer)
  })

  it('returns the same Document when nothing moves', () => {
    const document = doc(rect('a', 0, 0))

    const result = ok(alignLayers(document, ['a'], ['left', 'top'], measure))

    expect(result.document).toBe(document)
    expect(result.moved).toEqual([])
  })
})

describe('distributeLayers', () => {
  const xs = (document: Document, ids: string[]) => ids.map((id) => at(document, id)[0]!)

  it('spaces three or more Layers equally between the first and the last', () => {
    const document = doc(rect('a', 0, 0), rect('b', 15, 0), rect('c', 60, 0))

    const result = ok(distributeLayers(document, ['a', 'b', 'c'], 'x', measure))

    expect(xs(result.document, ['a', 'b', 'c'])).toEqual([0, 30, 60])
    expect(result.moved).toEqual(['b'])
  })

  it('distributes on the y axis', () => {
    const document = doc(rect('a', 0, 0), rect('b', 0, 2), rect('c', 0, 40))

    const result = ok(distributeLayers(document, ['a', 'b', 'c'], 'y', measure)).document

    expect(at(result, 'b')).toEqual([0, 20])
  })

  it('lets the equal space go negative when the Layers overlap', () => {
    // span 0..70, sizes 90: space (70 − 90) / 2 = −10
    const document = doc(rect('a', 0, 0, { width: 30 }), rect('b', 10, 0, { width: 30 }), rect('c', 40, 0, { width: 30 }))

    const result = ok(distributeLayers(document, ['a', 'b', 'c'], 'x', measure)).document

    expect(xs(result, ['a', 'b', 'c'])).toEqual([0, 20, 40])
  })

  it('rounds each equal position on its own, so the error does not add up', () => {
    // span 0..51, sizes 50: space 0.25, exact positions 0, 10.25, 20.5, 30.75, 41
    const document = doc(rect('a', 0, 0), rect('b', 1, 0), rect('c', 2, 0), rect('d', 3, 0), rect('e', 41, 0))

    const result = ok(distributeLayers(document, ['a', 'b', 'c', 'd', 'e'], 'x', measure)).document

    expect(xs(result, ['a', 'b', 'c', 'd', 'e'])).toEqual([0, 10, 21, 31, 41])
  })

  it('with a gap keeps the first Layer and puts each next one the gap after the previous', () => {
    const document = doc(rect('a', 0, 0), rect('b', 50, 0), rect('c', 20, 0))

    const result = ok(distributeLayers(document, ['b', 'a', 'c'], 'x', measure, { gap: 5 }))

    expect(xs(result.document, ['a', 'c', 'b'])).toEqual([0, 15, 30])
    expect(result.moved).toEqual(['b', 'c'])
  })

  it('with a gap goes on from where the previous Layer landed after rounding', () => {
    // a ends at 10.4, so c's x would be 12.4: it moves by −8 to 12.6 and ends at 22.6,
    // so b's x would be 24.6: it moves by −25 to 25 (by −26 to 24, had c landed at 12.4)
    const document = doc(rect('a', 0.4, 0), rect('c', 20.6, 0), rect('b', 50, 0))

    const result = ok(distributeLayers(document, ['a', 'b', 'c'], 'x', measure, { gap: 2 })).document

    expect(xs(result, ['a', 'c', 'b']).map((x) => Math.round(x * 10) / 10)).toEqual([0.4, 12.6, 25])
  })

  it('works with just two Layers when given a gap', () => {
    const result = ok(distributeLayers(doc(rect('a', 0, 0), rect('b', 50, 0)), ['a', 'b'], 'x', measure, { gap: 0 })).document

    expect(xs(result, ['a', 'b'])).toEqual([0, 10])
  })

  it('orders by the start of the extent, then by its centre, then by draw order', () => {
    // all start at 0; b and c (centre 5) come before a (centre 10), b before c as it is drawn first
    const document = doc(rect('a', 0, 0, { width: 20 }), rect('b', 0, 0), rect('c', 0, 0))

    const result = ok(distributeLayers(document, ['a', 'c', 'b'], 'x', measure, { gap: 0 })).document

    expect(xs(result, ['b', 'c', 'a'])).toEqual([0, 10, 20])
  })

  it('moves a Group as one Layer by its extent', () => {
    const document = doc(rect('c', 0, 0), group('g', [rect('a', 40, 0), rect('b', 50, 0)]))

    const result = ok(distributeLayers(document, ['g', 'c'], 'x', measure, { gap: 5 }))

    expect(xs(result.document, ['c', 'a', 'b'])).toEqual([0, 15, 25])
    expect(result.moved).toEqual(['g'])
  })

  it('distributes a rotated Layer by its rotated extent and keeps its rotation', () => {
    // r: 20×10 turned 90°, its extent is 10 wide and starts 5 px right of x
    const document = doc(rect('a', 0, 0), rect('r', 30, 0, { width: 20, height: 10, rotation: 90 }), rect('c', 90, 0))

    const result = ok(distributeLayers(document, ['a', 'r', 'c'], 'x', measure)).document

    // span 0..100, sizes 30: space 35, so r's extent starts at 45 and its x is 40
    expect(findLayer(result, 'r')!.layer).toMatchObject({ x: 40, y: 0, rotation: 90 })
  })
})

describe('alignLayers and distributeLayers refuse bad input', () => {
  const document = doc(rect('a', 0, 0), rect('b', 20, 0), group('g', [rect('c', 40, 0), rect('d', 60, 0)]))
  const code = (result: { ok: boolean; code?: string }) => (result.ok ? 'ok' : result.code)

  it('fails with NOT_FOUND for an unknown id', () => {
    const align = alignLayers(document, ['a', 'ghost'], ['left'], measure)
    const distribute = distributeLayers(document, ['a', 'b', 'ghost'], 'x', measure)

    expect(align).toMatchObject({ ok: false, code: 'NOT_FOUND', message: expect.stringContaining('"ghost"') })
    expect(code(distribute)).toBe('NOT_FOUND')
  })

  it('fails with INVALID_INPUT for a Layer together with a Group holding it', () => {
    expect(code(alignLayers(document, ['g', 'c'], ['left'], measure))).toBe('INVALID_INPUT')
    expect(code(distributeLayers(document, ['c', 'a', 'g'], 'x', measure))).toBe('INVALID_INPUT')
  })

  it('fails with INVALID_INPUT for too few Layers', () => {
    expect(code(alignLayers(document, [], ['left'], measure))).toBe('INVALID_INPUT')
    expect(code(distributeLayers(document, ['a', 'b'], 'x', measure))).toBe('INVALID_INPUT')
    expect(code(distributeLayers(document, ['a'], 'x', measure, { gap: 4 }))).toBe('INVALID_INPUT')
  })

  it('counts a repeated id once', () => {
    expect(code(distributeLayers(document, ['a', 'b', 'a'], 'x', measure))).toBe('INVALID_INPUT')
    expect(code(distributeLayers(document, ['a', 'a'], 'x', measure, { gap: 4 }))).toBe('INVALID_INPUT')
    const aligned = ok(alignLayers(document, ['b', 'b'], ['left'], measure))
    expect(aligned.moved).toEqual(['b'])
    expect(at(aligned.document, 'b')).toEqual([0, 0])
  })

  it('fails with INVALID_INPUT for a gap that is negative or not a finite number', () => {
    for (const gap of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(code(distributeLayers(document, ['a', 'b'], 'x', measure, { gap })), String(gap)).toBe('INVALID_INPUT')
    }
  })

  it('fails with INVALID_INPUT for no edge, or two edges on one axis', () => {
    expect(code(alignLayers(document, ['a'], [], measure))).toBe('INVALID_INPUT')
    expect(code(alignLayers(document, ['a'], ['left', 'right'], measure))).toBe('INVALID_INPUT')
    expect(code(alignLayers(document, ['a'], ['top', 'vcenter'], measure))).toBe('INVALID_INPUT')
  })
})
