import { describe, expect, it } from 'vitest'
import { ancestorsOf, findLayer, flatMapLayers, mapLeaves, translateLayer, withoutEmptyGroups, inheritedFlags, layerPath, mapLayers, removeLayers, replaceLayer, walkLayers, type Document, type Layer, type LeafLayer } from '../src/index.ts'

const rect = (id: string): Layer => ({ id, type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#000' })

const doc = (...layers: Layer[]): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width: 100, height: 50, background: '#ffffff' },
  layers,
})

describe('walkLayers', () => {
  it('visits every Layer bottom to top with its parent, position and path', () => {
    const document = doc(rect('a'), rect('b'), rect('c'))

    const visits = walkLayers(document)

    expect(visits.map((v) => [v.layer.id, v.index, v.path])).toEqual([
      ['a', 0, 'layers[0]'],
      ['b', 1, 'layers[1]'],
      ['c', 2, 'layers[2]'],
    ])
    expect(visits.every((v) => v.parent === document)).toBe(true)
  })

  it('visits nothing in an empty Document', () => {
    expect(walkLayers(doc())).toEqual([])
  })
})

describe('findLayer', () => {
  it('finds a Layer by id with its parent, position and path', () => {
    const document = doc(rect('a'), rect('b'))

    const found = findLayer(document, 'b')

    expect(found).toEqual({ layer: document.layers[1], parent: document, index: 1, path: 'layers[1]' })
  })

  it('finds nothing for an unknown id', () => {
    expect(findLayer(doc(rect('a')), 'zzz')).toBeUndefined()
  })
})

describe('replaceLayer', () => {
  it('replaces the Layer with the id and leaves the input untouched', () => {
    const document = doc(rect('a'), rect('b'))
    const before = structuredClone(document)

    const next = replaceLayer(document, 'b', (l) => ({ ...l, x: 5 }))

    expect((next.layers as LeafLayer[]).map((l) => [l.id, l.x])).toEqual([['a', 0], ['b', 5]])
    expect(next.layers[0]).toBe(document.layers[0])
    expect(document).toEqual(before)
  })

  it('returns the same Document for an unknown id', () => {
    const document = doc(rect('a'))
    expect(replaceLayer(document, 'zzz', (l) => ({ ...l, x: 5 }))).toBe(document)
  })
})

describe('mapLayers', () => {
  it('replaces every Layer, passing where each one sits, without touching the input', () => {
    const document = doc(rect('a'), rect('b'))
    const before = structuredClone(document)

    const seen: string[] = []
    const next = mapLayers(document, (l, { index, path }) => {
      seen.push(path)
      return { ...l, x: 100 + index }
    })

    expect(seen).toEqual(['layers[0]', 'layers[1]'])
    expect((next.layers as LeafLayer[]).map((l) => l.x)).toEqual([100, 101])
    expect(document).toEqual(before)
  })
})

describe('removeLayers', () => {
  it('removes the Layers with the ids and leaves the input untouched', () => {
    const document = doc(rect('a'), rect('b'), rect('c'))
    const before = structuredClone(document)

    const next = removeLayers(document, ['a', 'c', 'zzz'])

    expect(next.layers.map((l) => l.id)).toEqual(['b'])
    expect(document).toEqual(before)
  })
})

describe('Groups in the tree', () => {
  const group = (id: string, ...layers: Layer[]): Layer => ({ id, type: 'group', layers })

  it('walks into Groups in draw order, a Group before its children', () => {
    const inner = group('h', rect('c'))
    const outer = group('g', rect('b'), inner)
    const document = doc(rect('a'), outer, rect('d'))

    const visits = walkLayers(document)

    expect(visits.map((v) => [v.layer.id, v.index, v.path])).toEqual([
      ['a', 0, 'layers[0]'],
      ['g', 1, 'layers[1]'],
      ['b', 0, 'layers[1].layers[0]'],
      ['h', 1, 'layers[1].layers[1]'],
      ['c', 0, 'layers[1].layers[1].layers[0]'],
      ['d', 2, 'layers[2]'],
    ])
    expect(findLayer(document, 'c')?.parent).toBe(inner)
  })

  it('maps children before their Group, keeping untouched Groups by reference', () => {
    const untouched = group('u', rect('x'))
    const document = doc(group('g', rect('a'), group('h', rect('b'))), untouched)

    const next = mapLayers(document, (l) => (l.id === 'b' ? { ...l, x: 7 } : l))

    expect(findLayer(next, 'b')?.layer).toMatchObject({ x: 7 })
    expect(next.layers[1]).toBe(untouched)
    expect(findLayer(document, 'b')?.layer).toMatchObject({ x: 0 })
  })

  it('replaces a Layer inside a Group', () => {
    const next = replaceLayer(doc(group('g', rect('a'))), 'a', (l) => ({ ...l, id: 'z' }))

    expect(walkLayers(next).map((v) => v.layer.id)).toEqual(['g', 'z'])
  })

  it('removes Layers inside Groups, and a Group left empty with them', () => {
    const document = doc(group('g', rect('a'), rect('b')), group('h', rect('c')), rect('d'))

    const next = removeLayers(document, ['a', 'c'])

    expect(walkLayers(next).map((v) => v.layer.id)).toEqual(['g', 'b', 'd'])
  })
})

describe('layerPath', () => {
  it('joins one layers[i] per level', () => {
    expect(layerPath([2])).toBe('layers[2]')
    expect(layerPath([1, 0])).toBe('layers[1].layers[0]')
  })
})

describe('inheritedFlags', () => {
  const group = (id: string, over: object, ...layers: Layer[]): Layer => ({ id, type: 'group', layers, ...over }) as Layer
  // outer (locked) > inner (hidden) > a; b (own locked) at the root
  const document = doc(group('outer', { locked: true }, group('inner', { visible: false }, rect('a'))), { ...rect('b'), locked: true } as Layer)

  it('a Layer is locked or hidden when it or any ancestor Group is, naming the nearest Group that causes it', () => {
    const flags = inheritedFlags(document, 'a')!

    expect([flags.locked, flags.hidden, flags.lockedBy?.id, flags.hiddenBy?.id]).toEqual([true, true, 'outer', 'inner'])
    const inner = inheritedFlags(document, 'inner')!
    expect([inner.locked, inner.hidden, inner.lockedBy?.id, 'hiddenBy' in inner]).toEqual([true, true, 'outer', false])
  })

  it('its own flag counts, with no Group to name', () => {
    expect(inheritedFlags(document, 'b')).toEqual({ locked: true, hidden: false })
    expect(inheritedFlags(document, 'outer')).toEqual({ locked: true, hidden: false })
  })

  it('is undefined for an unknown id', () => {
    expect(inheritedFlags(document, 'nope')).toBeUndefined()
  })
})

describe('flatMapLayers', () => {
  const group = (id: string, ...layers: Layer[]): Layer => ({ id, type: 'group', layers })

  it('replaces each Layer with any number of Layers, children before their Group', () => {
    const document = doc(group('g', rect('a'), rect('b')), rect('c'))
    const before = structuredClone(document)

    const next = flatMapLayers(document, (l) => (l.id === 'a' ? [] : l.id === 'b' ? [l, rect('b2')] : [l]))

    expect(walkLayers(next).map((v) => v.layer.id)).toEqual(['g', 'b', 'b2', 'c'])
    expect(next.layers[1]).toBe(document.layers[1])
    expect(document).toEqual(before)
  })

  it('returns the root itself when nothing changes', () => {
    const document = doc(group('g', rect('a')))
    expect(flatMapLayers(document, (l) => [l])).toBe(document)
  })
})

describe('withoutEmptyGroups', () => {
  const group = (id: string, ...layers: Layer[]): Layer => ({ id, type: 'group', layers })

  it('drops Groups with no children, and a Group holding only those', () => {
    const kept = group('k', rect('a'))
    const document = doc(kept, group('g', group('h')), rect('b'))

    const next = withoutEmptyGroups(document)

    expect(walkLayers(next).map((v) => v.layer.id)).toEqual(['k', 'a', 'b'])
    expect(next.layers[0]).toBe(kept)
  })
})

describe('mapLeaves', () => {
  const group = (id: string, ...layers: Layer[]): Layer => ({ id, type: 'group', layers })

  it('replaces every leaf in a Group, at any depth', () => {
    const layer = group('g', rect('a'), group('h', rect('b')))

    const next = mapLeaves(layer, (leaf) => ({ ...leaf, x: 3 }))

    expect(walkLayers({ layers: [next] }).map((v) => [v.layer.id, 'x' in v.layer ? v.layer.x : '-'])).toEqual([
      ['g', '-'],
      ['a', 3],
      ['h', '-'],
      ['b', 3],
    ])
    expect(layer).toEqual(group('g', rect('a'), group('h', rect('b'))))
  })

  it('replaces a leaf itself', () => {
    expect(mapLeaves(rect('a'), (leaf) => ({ ...leaf, x: 3 }))).toMatchObject({ id: 'a', x: 3 })
  })
})

describe('translateLayer', () => {
  it('moves a leaf by dx, dy', () => {
    expect(translateLayer(rect('a'), 5, -2)).toMatchObject({ x: 5, y: -2, width: 10 })
  })

  it('moves a Group by moving every Layer in it', () => {
    const moved = translateLayer({ id: 'g', type: 'group', layers: [rect('a'), { id: 'h', type: 'group', layers: [rect('b')] }] }, 1, 2)

    expect(walkLayers({ layers: [moved] }).flatMap((v) => (v.layer.type === 'group' ? [] : [[v.layer.x, v.layer.y]]))).toEqual([
      [1, 2],
      [1, 2],
    ])
  })
})

describe('ancestorsOf', () => {
  const group = (id: string, ...layers: Layer[]): Layer => ({ id, type: 'group', layers })
  const document = doc(group('outer', rect('b'), group('inner', rect('a'))), rect('c'))

  it('names the Groups holding a Layer, innermost first', () => {
    expect(ancestorsOf(document, 'a').map((g) => g.id)).toEqual(['inner', 'outer'])
    expect(ancestorsOf(document, 'inner').map((g) => g.id)).toEqual(['outer'])
  })

  it('is empty for a top-level Layer or an unknown id', () => {
    expect(ancestorsOf(document, 'c')).toEqual([])
    expect(ancestorsOf(document, 'nope')).toEqual([])
  })
})
