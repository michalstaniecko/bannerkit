import { describe, expect, it } from 'vitest'
import {
  duplicateLayers,
  group,
  moveIntoGroup,
  moveLayerTo,
  moveOutOfGroup,
  removeLayers,
  ungroup,
  validateDocument,
  type Document,
  type GroupLayer,
  type Layer,
  type LeafLayer,
} from '../src/index.ts'

const rect = (id: string, x = 0): LeafLayer => ({ id, type: 'rect', x, y: 0, width: 10, height: 10, fill: '#000' })
const grp = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

const doc = (...layers: Layer[]): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width: 100, height: 50, background: '#ffffff' },
  layers,
})

/** The tree as nested ids: a Group is `[id, [children]]`. */
type Shape = string | [string, Shape[]]
const shape = (layers: readonly Layer[]): Shape[] =>
  layers.map((l) => (l.type === 'group' ? [l.id, shape(l.layers)] : l.id))

/** The Document after a successful operation, which must also be valid. */
function ok<R extends { ok: boolean }>(result: R): Extract<R, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`)
  const done = result as Extract<R, { ok: true }> & { document: Document }
  expect(validateDocument(done.document).errors).toEqual([])
  return done
}

describe('group', () => {
  it('wraps the Layers in a new Group where the top one was, keeping their order', () => {
    const document = doc(rect('a'), rect('b'), rect('c'), rect('d'))

    const result = ok(group(document, ['c', 'a']))

    expect(result.id).toBe('group-1')
    expect(shape(result.document.layers)).toEqual(['b', ['group-1', ['a', 'c']], 'd'])
  })

  it('keeps the Layers as they are, coordinates included, and gives the Group no name unless asked', () => {
    const document = doc(rect('a', 5), rect('b', 7))

    const plain = ok(group(document, ['a', 'b']))
    const named = ok(group(document, ['a'], { name: 'Badge' }))

    expect(plain.document.layers).toEqual([{ id: 'group-1', type: 'group', layers: [rect('a', 5), rect('b', 7)] }])
    expect(named.document.layers[0]).toEqual({ id: 'group-1', type: 'group', name: 'Badge', layers: [rect('a', 5)] })
  })

  it('groups inside a Group, with an id clear of every id in the tree', () => {
    const document = doc(grp('group-1', [rect('a'), rect('b'), rect('c')]), grp('group-3', [rect('d')]))

    const result = ok(group(document, ['b', 'c']))

    expect(result.id).toBe('group-4')
    expect(shape(result.document.layers)).toEqual([['group-1', ['a', ['group-4', ['b', 'c']]]], ['group-3', ['d']]])
  })

  it('does not touch the input', () => {
    const document = doc(rect('a'), rect('b'))
    const before = structuredClone(document)

    group(document, ['a'])

    expect(document).toEqual(before)
  })

  it('fails for Layers with different parents', () => {
    const result = group(doc(rect('a'), grp('group-1', [rect('b')])), ['a', 'b'])

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', message: expect.stringContaining('same parent') })
  })

  it('fails without Layers', () => {
    expect(group(doc(rect('a')), [])).toEqual({ ok: false, code: 'INVALID_INPUT', message: expect.any(String) })
  })

  it('fails for an unknown id', () => {
    expect(group(doc(rect('a')), ['a', 'nope'])).toEqual({ ok: false, code: 'NOT_FOUND', message: expect.stringContaining('"nope"') })
  })
})

describe('ungroup', () => {
  it('puts the children where the Group was, in order and with their coordinates', () => {
    const document = doc(rect('a'), grp('group-1', [rect('b', 3), grp('group-2', [rect('c', 4)])], { opacity: 0.5 }), rect('d'))

    const result = ok(ungroup(document, 'group-1'))

    expect(result.ids).toEqual(['b', 'group-2'])
    expect(result.document.layers).toEqual([rect('a'), rect('b', 3), grp('group-2', [rect('c', 4)]), rect('d')])
  })

  it('ungroups a Group inside a Group', () => {
    const document = doc(grp('group-1', [rect('a'), grp('group-2', [rect('b'), rect('c')])]))

    const result = ok(ungroup(document, 'group-2'))

    expect(shape(result.document.layers)).toEqual([['group-1', ['a', 'b', 'c']]])
  })

  it('undoes group', () => {
    const document = doc(rect('a'), rect('b'), rect('c'))
    const grouped = ok(group(document, ['a', 'b']))

    expect(ok(ungroup(grouped.document, grouped.id)).document).toEqual(document)
  })

  it('fails for a Layer that is not a Group', () => {
    expect(ungroup(doc(rect('a')), 'a')).toEqual({ ok: false, code: 'INVALID_INPUT', message: expect.stringContaining('not a Group') })
  })

  it('fails for an unknown id', () => {
    expect(ungroup(doc(rect('a')), 'nope')).toEqual({ ok: false, code: 'NOT_FOUND', message: expect.stringContaining('"nope"') })
  })
})

describe('moveIntoGroup', () => {
  it('puts a Layer on top of the Group by default, leaving its coordinates alone', () => {
    const document = doc(rect('a', 7), grp('group-1', [rect('b'), rect('c')]), rect('d'))

    const result = ok(moveIntoGroup(document, 'a', 'group-1'))

    expect(shape(result.document.layers)).toEqual([['group-1', ['b', 'c', 'a']], 'd'])
    expect(result.document.layers[0]).toMatchObject({ layers: [rect('b'), rect('c'), rect('a', 7)] })
  })

  it('puts a Layer at a position in the Group', () => {
    const document = doc(grp('group-1', [rect('b'), rect('c')]), rect('a'))

    const result = ok(moveIntoGroup(document, 'a', 'group-1', 1))

    expect(shape(result.document.layers)).toEqual([['group-1', ['b', 'a', 'c']]])
  })

  it('moves a whole Group into another Group', () => {
    const document = doc(grp('group-1', [rect('a')]), grp('group-2', [rect('b')]))

    const result = ok(moveIntoGroup(document, 'group-1', 'group-2', 0))

    expect(shape(result.document.layers)).toEqual([['group-2', [['group-1', ['a']], 'b']]])
  })

  it('drops a Group the move leaves empty, in the same step', () => {
    const document = doc(grp('group-1', [grp('group-2', [rect('a')])]), grp('group-3', [rect('b')]))

    const result = ok(moveIntoGroup(document, 'a', 'group-3'))

    expect(shape(result.document.layers)).toEqual([['group-3', ['b', 'a']]])
  })

  it('refuses to put a Group into itself or its descendant', () => {
    const document = doc(grp('group-1', [rect('a'), grp('group-2', [rect('b')])]))

    expect(moveIntoGroup(document, 'group-1', 'group-1')).toEqual({ ok: false, code: 'INVALID_INPUT', message: expect.any(String) })
    expect(moveIntoGroup(document, 'group-1', 'group-2')).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      message: expect.stringContaining('descendant'),
    })
  })

  it('refuses a target that is not a Group, an unknown id and a position out of range', () => {
    const document = doc(rect('a'), grp('group-1', [rect('b')]))

    expect(moveIntoGroup(document, 'a', 'b')).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(moveIntoGroup(document, 'nope', 'group-1')).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(moveIntoGroup(document, 'a', 'nope')).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(moveIntoGroup(document, 'a', 'group-1', 2)).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(moveIntoGroup(document, 'a', 'group-1', -1)).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
  })
})

describe('moveOutOfGroup', () => {
  it("puts a Layer right above its Group, in the Group's parent, leaving its coordinates alone", () => {
    const document = doc(rect('a'), grp('group-1', [rect('b', 3), rect('c')]), rect('d'))

    const result = ok(moveOutOfGroup(document, 'b'))

    expect(shape(result.document.layers)).toEqual(['a', ['group-1', ['c']], 'b', 'd'])
    expect(result.document.layers[2]).toEqual(rect('b', 3))
  })

  it("puts a Layer at a position in the Group's parent", () => {
    const document = doc(rect('a'), grp('group-1', [grp('group-2', [rect('b'), rect('c')])]))

    const result = ok(moveOutOfGroup(document, 'c', 0))

    expect(shape(result.document.layers)).toEqual(['a', ['group-1', ['c', ['group-2', ['b']]]]])
  })

  it('drops the Group it leaves empty, so the Layer takes its place', () => {
    const document = doc(rect('a'), grp('group-1', [rect('b')]), rect('c'))

    const result = ok(moveOutOfGroup(document, 'b'))

    expect(shape(result.document.layers)).toEqual(['a', 'b', 'c'])
  })

  it('fails for a Layer that is not in a Group, and for an unknown id', () => {
    expect(moveOutOfGroup(doc(rect('a')), 'a')).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(moveOutOfGroup(doc(rect('a')), 'nope')).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })
})

describe('duplicateLayers', () => {
  it('copies a Group right above it, with new ids for the Group and everything in it', () => {
    const document = doc(grp('group-1', [rect('rect-1', 5), grp('group-2', [rect('rect-2')])], { name: 'Badge' }), rect('rect-3'))

    const result = duplicateLayers(document, ['group-1'])

    expect(result.ids).toEqual(['group-3'])
    expect(result.document.layers).toEqual([
      document.layers[0],
      grp('group-3', [{ ...rect('rect-4', 5) }, grp('group-4', [rect('rect-5')])], { name: 'Badge' }),
      rect('rect-3'),
    ])
    expect(validateDocument(result.document).errors).toEqual([])
  })

  it('moves the copied leaves by an offset when asked', () => {
    const result = duplicateLayers(doc(grp('group-1', [rect('rect-1', 5)])), ['group-1'], { offset: 10 })

    expect(result.document.layers[1]).toEqual(grp('group-2', [{ ...rect('rect-2', 15), y: 10 }]))
  })

  it('copies a Layer inside a Group within that Group', () => {
    const result = duplicateLayers(doc(grp('group-1', [rect('rect-1'), rect('rect-2')])), ['rect-1'])

    expect(shape(result.document.layers)).toEqual([['group-1', ['rect-1', 'rect-3', 'rect-2']]])
  })

  it('does not touch the input', () => {
    const document = doc(grp('group-1', [rect('rect-1')]))
    const before = structuredClone(document)

    duplicateLayers(document, ['group-1'])

    expect(document).toEqual(before)
  })
})

describe('removeLayers', () => {
  it('removes a Group with everything in it', () => {
    const document = doc(rect('a'), grp('group-1', [rect('b'), grp('group-2', [rect('c')])]))

    expect(removeLayers(document, ['group-1']).layers).toEqual([rect('a')])
  })
})

describe('moveLayerTo', () => {
  it('moves a Layer from deep in the tree to a position at the Document root', () => {
    const document = doc(rect('a'), grp('group-1', [rect('b'), grp('group-2', [rect('c'), rect('d')])]))

    const result = ok(moveLayerTo(document, 'd', { into: null, index: 0 }))

    expect(shape(result.document.layers)).toEqual(['d', 'a', ['group-1', ['b', ['group-2', ['c']]]]])
  })

  it('reorders a Layer within its own parent, counting positions without it', () => {
    const document = doc(rect('a'), rect('b'), rect('c'))

    expect(shape(ok(moveLayerTo(document, 'a', { into: null, index: 2 })).document.layers)).toEqual(['b', 'c', 'a'])
    expect(shape(ok(moveLayerTo(document, 'c', { into: null })).document.layers)).toEqual(['a', 'b', 'c'])
  })

  it('does not touch the input', () => {
    const document = doc(rect('a'), grp('group-1', [rect('b')]))
    const before = structuredClone(document)

    moveLayerTo(document, 'b', { into: null })

    expect(document).toEqual(before)
  })
})
