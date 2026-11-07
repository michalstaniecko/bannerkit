import { describe, expect, it } from 'vitest'
import { findLayer, layerPath, mapLayers, removeLayers, replaceLayer, walkLayers, type Document, type Layer, type LeafLayer } from '../src/index.ts'

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
