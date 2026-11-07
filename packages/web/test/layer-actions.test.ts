// Layer list and toolbar actions: pure Document → Document functions the UI applies
// through `editor.apply(document, { cause: 'layers' })`.
import { validateDocument, type Document, type Layer, type LeafLayer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { addLayer, deleteLayers, dropLayer, duplicateLayers, groupSelection, setLayerFlag, ungroupSelection } from '../src/layer-actions.ts'

describe('deleteLayers', () => {
  it('removes one or several Layers', () => {
    const d = doc([rect('a'), rect('b'), rect('c')])
    expect(ids(deleteLayers(d, ['b']))).toEqual(['a', 'c'])
    expect(ids(deleteLayers(d, ['c', 'a']))).toEqual(['b'])
  })
})

describe('duplicateLayers', () => {
  it('puts a copy with the next readable id directly above its original, offset', () => {
    const { document, ids: copies } = duplicateLayers(doc([rect('rect-1'), rect('rect-2')]), ['rect-1'])

    expect(copies).toEqual(['rect-3'])
    expect(ids(document)).toEqual(['rect-1', 'rect-3', 'rect-2'])
    expect(document.layers[1]).toEqual({ ...rect('rect-3'), x: 20, y: 30 })
  })

  it('duplicates a multi-selection with distinct ids', () => {
    const text: Layer = { id: 'text-1', type: 'text', x: 0, y: 0, width: 50, text: 'Hi', fontFamily: 'Inter', fontWeight: 400, fontSize: 10, fill: '#000' }
    const { document, ids: copies } = duplicateLayers(doc([rect('rect-1'), text, rect('rect-2')]), ['rect-1', 'text-1', 'rect-2'])

    expect(copies).toEqual(['rect-3', 'text-2', 'rect-4'])
    expect(ids(document)).toEqual(['rect-1', 'rect-3', 'text-1', 'text-2', 'rect-2', 'rect-4'])
    expect(validateDocument(document)).toMatchObject({ ok: true })
  })

  it('copies a Group with new ids for everything in it, its leaves offset', () => {
    const group: Layer = { id: 'group-1', type: 'group', layers: [rect('rect-1'), { id: 'group-2', type: 'group', layers: [rect('rect-2')] }] }

    const { document, ids: copies } = duplicateLayers(doc([group]), ['group-1'])

    expect(copies).toEqual(['group-3'])
    expect(document.layers[1]).toEqual({
      id: 'group-3',
      type: 'group',
      layers: [{ ...rect('rect-3'), x: 20, y: 30 }, { id: 'group-4', type: 'group', layers: [{ ...rect('rect-4'), x: 20, y: 30 }] }],
    })
    expect(validateDocument(document)).toMatchObject({ ok: true })
  })
})

const rect =(id: string, over: Partial<Extract<Layer, { type: 'rect' }>> = {}): Layer => ({
  id,
  type: 'rect',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  fill: '#ff0000',
  ...over,
})

const doc = (layers: Layer[]): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width: 300, height: 250, background: '#ffffff' },
  layers,
})

const ids = (d: Document) => d.layers.map((l) => l.id)

describe('dropLayer', () => {
  const three = doc([rect('a'), rect('b'), rect('c')]) // bottom → top
  const moved = (result: ReturnType<typeof dropLayer>) => {
    if (!result.ok) throw new Error(result.message)
    return result.document
  }
  const tree = (d: Document | Layer): unknown =>
    'layers' in d ? ('type' in d ? { [d.id]: d.layers.map(tree) } : d.layers.map(tree)) : d.id
  const grouped = () =>
    doc([rect('a'), { id: 'g', type: 'group', layers: [rect('x'), { id: 'h', type: 'group', layers: [rect('y')] }] }, rect('b')])

  it('drops a Layer above or below another in the same parent (the list shows the top first)', () => {
    expect(ids(moved(dropLayer(three, 'a', 'c', 'above')))).toEqual(['b', 'c', 'a'])
    expect(ids(moved(dropLayer(three, 'a', 'c', 'below')))).toEqual(['b', 'a', 'c'])
    expect(ids(moved(dropLayer(three, 'c', 'a', 'above')))).toEqual(['a', 'c', 'b'])
    expect(ids(moved(dropLayer(three, 'c', 'a', 'below')))).toEqual(['c', 'a', 'b'])
    expect(ids(three)).toEqual(['a', 'b', 'c'])
  })

  it('drops into a Group on top of its Layers', () => {
    expect(tree(moved(dropLayer(grouped(), 'a', 'g', 'into')))).toEqual([{ g: ['x', { h: ['y'] }, 'a'] }, 'b'])
  })

  it('drops next to a Layer inside a Group, and out of a Group next to a root Layer', () => {
    expect(tree(moved(dropLayer(grouped(), 'b', 'x', 'below')))).toEqual(['a', { g: ['b', 'x', { h: ['y'] }] }])
    expect(tree(moved(dropLayer(grouped(), 'x', 'a', 'above')))).toEqual(['a', 'x', { g: [{ h: ['y'] }] }, 'b'])
  })

  it('removes a Group whose last Layer is dropped out of it', () => {
    expect(tree(moved(dropLayer(grouped(), 'y', 'b', 'above')))).toEqual(['a', { g: ['x'] }, 'b', 'y'])
  })

  it('refuses a Group dropped into or next to its own descendant, and a drop on itself', () => {
    expect(dropLayer(grouped(), 'g', 'h', 'into')).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(dropLayer(grouped(), 'g', 'y', 'above')).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(dropLayer(grouped(), 'g', 'g', 'into')).toMatchObject({ ok: false })
    expect(dropLayer(three, 'b', 'b', 'above')).toMatchObject({ ok: false })
  })

  it('refuses dropping into a Layer that is not a Group', () => {
    expect(dropLayer(three, 'a', 'b', 'into')).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
  })
})

describe('setLayerFlag', () => {
  it('hides and shows a Layer, dropping the flag at its default', () => {
    const hidden = setLayerFlag(doc([rect('a')]), 'a', 'visible', false)
    expect(hidden.layers[0]).toMatchObject({ visible: false })
    expect(setLayerFlag(hidden, 'a', 'visible', true).layers[0]).toEqual(rect('a'))
  })

  it('locks and unlocks a Layer', () => {
    const locked = setLayerFlag(doc([rect('a'), rect('b')]), 'b', 'locked', true)
    expect(locked.layers.map((l) => l.locked)).toEqual([undefined, true])
    expect(setLayerFlag(locked, 'b', 'locked', false).layers[1]).toEqual(rect('b'))
  })
})

describe('addLayer', () => {
  it('adds a rect on top, centred in the Canvas, with the next readable id', () => {
    const { document, id } = addLayer(doc([rect('rect-1'), rect('rect-3')]), { type: 'rect' })

    expect(id).toBe('rect-4')
    const added = document.layers.at(-1)! as LeafLayer
    expect(added).toMatchObject({ id: 'rect-4', type: 'rect' })
    expect(added.x + added.width / 2).toBe(150)
    expect(added.y + added.height! / 2).toBe(125)
  })

  it('adds a text Layer in a manifest font', () => {
    const { document, id } = addLayer(doc([]), { type: 'text' })

    expect(id).toBe('text-1')
    expect(document.layers[0]).toMatchObject({ type: 'text', fontFamily: 'Inter', text: expect.any(String) })
  })

  it('adds an image Layer for an added Asset, keeping its aspect ratio inside the Canvas', () => {
    const { document, id } = addLayer(doc([]), { type: 'image', src: 'assets/shoe.png', width: 1000, height: 500 })

    expect(id).toBe('image-1')
    const image = document.layers[0]! as LeafLayer
    expect(image).toMatchObject({ type: 'image', src: 'assets/shoe.png', fit: 'contain' })
    expect(image.width / image.height!).toBe(2)
    expect(image.width).toBeLessThanOrEqual(300)
  })

  it('produces valid Documents', () => {
    let d = doc([])
    for (const spec of [{ type: 'rect' }, { type: 'text' }, { type: 'image', src: 'assets/a.png', width: 10, height: 10 }] as const) {
      d = addLayer(d, spec).document
    }
    expect(validateDocument(d)).toMatchObject({ ok: true, errors: [] })
  })

  describe('in the context of the Selection', () => {
    const tree = () =>
      doc([
        rect('rect-1'),
        { id: 'group-1', type: 'group', layers: [rect('rect-2'), rect('rect-3'), rect('rect-4')] },
        rect('rect-5'),
      ])
    const childIds = (d: Document) => (d.layers[1] as Extract<Layer, { type: 'group' }>).layers.map((l) => l.id)

    it('puts it in the parent of selected children, right above the topmost one', () => {
      const { document, id } = addLayer(tree(), { type: 'rect' }, ['rect-3', 'rect-2'])

      expect(id).toBe('rect-6')
      expect(ids(document)).toEqual(['rect-1', 'group-1', 'rect-5'])
      expect(childIds(document)).toEqual(['rect-2', 'rect-3', 'rect-6', 'rect-4'])
      expect(validateDocument(document)).toMatchObject({ ok: true })
    })

    it('puts it right above a selected Group, on its level', () => {
      const { document } = addLayer(tree(), { type: 'text' }, ['group-1'])

      expect(ids(document)).toEqual(['rect-1', 'group-1', 'text-1', 'rect-5'])
      expect(childIds(document)).toEqual(['rect-2', 'rect-3', 'rect-4'])
    })

    it('puts it on top of the root without a Selection', () => {
      expect(ids(addLayer(tree(), { type: 'rect' }, []).document)).toEqual(['rect-1', 'group-1', 'rect-5', 'rect-6'])
    })
  })
})

describe('groupSelection', () => {
  it('wraps the selected Layers in a new unnamed Group and selects it', () => {
    const result = groupSelection(doc([rect('rect-1'), rect('rect-2'), rect('rect-3')]), ['rect-3', 'rect-1'])

    expect(result?.select).toEqual(['group-1'])
    expect(result?.document.layers).toEqual([rect('rect-2'), { id: 'group-1', type: 'group', layers: [rect('rect-1'), rect('rect-3')] }])
  })

  it('is unavailable without a Selection or for Layers of different parents', () => {
    const d = doc([rect('rect-1'), { id: 'group-1', type: 'group', layers: [rect('rect-2')] }])
    expect(groupSelection(d, [])).toBeUndefined()
    expect(groupSelection(d, ['rect-1', 'rect-2'])).toBeUndefined()
  })
})

describe('ungroupSelection', () => {
  const nested = doc([
    { id: 'group-1', type: 'group', opacity: 0.5, layers: [rect('rect-1'), rect('rect-2')] },
    rect('rect-3'),
    { id: 'group-2', type: 'group', layers: [rect('rect-4')] },
  ])

  it('ungroups every selected Group and selects their former children', () => {
    const result = ungroupSelection(nested, ['group-1', 'rect-3', 'group-2'])

    expect(result?.select).toEqual(['rect-1', 'rect-2', 'rect-4'])
    expect(result && ids(result.document)).toEqual(['rect-1', 'rect-2', 'rect-3', 'rect-4'])
  })

  it('is unavailable when no Group is selected', () => {
    expect(ungroupSelection(nested, [])).toBeUndefined()
    expect(ungroupSelection(nested, ['rect-3'])).toBeUndefined()
  })
})
