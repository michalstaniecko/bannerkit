import { describe, expect, it } from 'vitest'
import { group, ungroup, validateDocument, type Document, type GroupLayer, type Layer } from '../src/index.ts'

const rect = (id: string, x = 0): Layer => ({ id, type: 'rect', x, y: 0, width: 10, height: 10, fill: '#000' })
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
