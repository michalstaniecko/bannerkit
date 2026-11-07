import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { addAssets, createDocument, createProject, inspect, writeDocument, writeSelection, type InspectResult, type LeafInspection } from '../src/ops/index.ts'
import { tempRoot } from './harness.ts'

let root: string
beforeEach(async () => {
  root = await tempRoot()
  await createProject({ root, name: 'p' })
})

const text = (over: Record<string, unknown>) => ({
  id: 'text-1',
  type: 'text',
  x: 10,
  y: 10,
  width: 280,
  text: 'Hello',
  fontFamily: 'Inter',
  fontWeight: 400,
  fontSize: 20,
  fill: '#000000',
  ...over,
})

async function doc(layers: unknown[], canvas = { width: 300, height: 250 }, version = 1) {
  await writeDocument({
    root,
    project: 'p',
    name: 'hero',
    document: { version, name: 'hero', canvas: { ...canvas, background: '#ffffff' }, layers },
  })
}

/** The entries of a Document without Groups. */
const leaves = (result: InspectResult) => result.layers as LeafInspection[]

const rect = (id: string, box: Record<string, number>) => ({ id, type: 'rect', fill: '#ff0000', ...box })

describe('inspect: extent and Canvas placement', () => {
  it('says whether each Layer is inside, partly outside or fully outside the Canvas, and warns', async () => {
    await doc([
      rect('in', { x: 10, y: 10, width: 100, height: 100 }),
      rect('edge', { x: 250, y: 200, width: 100, height: 100 }),
      rect('gone', { x: 400, y: 10, width: 50, height: 50 }),
      // A 100px square at the top-left corner rotated 45°: its corners poke out past x=0 and y=0.
      rect('turned', { x: 0, y: 0, width: 100, height: 100, rotation: 45 }),
    ])

    const result = await inspect({ root, project: 'p', name: 'hero' })

    expect(result.layers.map((l) => [l.id, l.placement])).toEqual([
      ['in', 'inside'],
      ['edge', 'partial'],
      ['gone', 'outside'],
      ['turned', 'partial'],
    ])
    const half = 50 * Math.SQRT2
    expect(result.layers[3]!.extent).toEqual({
      x: expect.closeTo(50 - half, 6),
      y: expect.closeTo(50 - half, 6),
      width: expect.closeTo(2 * half, 6),
      height: expect.closeTo(2 * half, 6),
    })
    expect(result.warnings.map((w) => w.path)).toEqual(['layers[1]', 'layers[2]', 'layers[3]'])
    expect(result.warnings[1]!.message).toMatch(/entirely outside the Canvas/)
  })

  it('measures a text Layer without a height by its laid-out text block', async () => {
    await doc([text({ y: 240, text: 'Low' })])
    const [layer] = leaves(await inspect({ root, project: 'p', name: 'hero' }))
    expect(layer!.extent.height).toBe(layer!.text!.height)
    expect(layer!.placement).toBe('partial')
  })
})

describe('inspect: Selection', () => {
  it('has no Selection when the editor has recorded none', async () => {
    await doc([rect('a', { x: 0, y: 0, width: 10, height: 10 })])
    const result = await inspect({ root, project: 'p', name: 'hero' })
    expect(result.selection).toBeNull()
    expect(result.layers[0]!.selected).toBe(false)
  })

  it('includes the Selection recorded for this Document and marks the selected Layers', async () => {
    await doc([rect('a', { x: 0, y: 0, width: 10, height: 10 }), rect('b', { x: 0, y: 0, width: 10, height: 10 })])
    await writeSelection({ root, project: 'p', doc: 'hero', selectedLayerIds: ['b'] })

    const result = await inspect({ root, project: 'p', name: 'hero' })

    expect(result.selection).toEqual({ doc: 'hero', selectedLayerIds: ['b'] })
    expect(result.layers.map((l) => l.selected)).toEqual([false, true])
  })

  it('ignores a Selection recorded for another Document', async () => {
    await doc([rect('a', { x: 0, y: 0, width: 10, height: 10 })])
    await createDocument({ root, project: 'p', name: 'other', size: { width: 10, height: 10 } })
    await writeSelection({ root, project: 'p', doc: 'other', selectedLayerIds: ['a'] })

    const result = await inspect({ root, project: 'p', name: 'hero' })

    expect(result.selection).toBeNull()
    expect(result.layers[0]!.selected).toBe(false)
  })

  it('inspects the selected Document when no name is given', async () => {
    await doc([rect('a', { x: 0, y: 0, width: 10, height: 10 })])
    await writeSelection({ root, project: 'p', doc: 'hero', selectedLayerIds: ['a'] })

    const result = await inspect({ root, project: 'p' })

    expect(result).toMatchObject({ name: 'hero', selection: { doc: 'hero', selectedLayerIds: ['a'] } })
  })

  it('needs a name when there is no Selection to pick the Document', async () => {
    await doc([])
    await expect(inspect({ root, project: 'p' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('inspect: Assets', () => {
  it('reports the intrinsic size of each image Layer Asset, raster and SVG', async () => {
    const sources = await tempRoot()
    const png = join(sources, 'photo.png')
    await sharp({ create: { width: 40, height: 20, channels: 3, background: '#00ff00' } }).png().toFile(png)
    const svg = join(sources, 'logo.svg')
    await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60"/></svg>')
    const { assets } = await addAssets({ root, project: 'p', files: [{ path: png }, { path: svg }] })
    const image = (id: string, src: string) => ({ id, type: 'image', x: 0, y: 0, width: 100, height: 100, fit: 'contain', src })
    await doc([image('image-1', assets[0]!.src), image('image-2', assets[1]!.src)])

    const result = await inspect({ root, project: 'p', name: 'hero' })

    expect(leaves(result).map((l) => l.asset)).toEqual([
      { src: assets[0]!.src, width: 40, height: 20 },
      { src: assets[1]!.src, width: 120, height: 60 },
    ])
  })
})

describe('inspect: Text Layout', () => {
  it('reports the line breaks a narrow Box forces, at the requested font size', async () => {
    // At 20px Inter one "Summer" is about 70px, so two cannot share a 100px line; "\n" always breaks.
    await doc([text({ text: 'Summer Summer\nsale', width: 100 })])

    const result = await inspect({ root, project: 'p', name: 'hero' })

    const [layer] = leaves(result)
    expect(layer).toMatchObject({ id: 'text-1', type: 'text', index: 0 })
    expect(layer!.text).toMatchObject({ fontSize: 20, requestedFontSize: 20, overflow: false })
    expect(layer!.text!.lines.map((l) => l.text)).toEqual(['Summer', 'Summer', 'sale'])
    expect(result.warnings).toEqual([])
  })

  it('reports the lines as drawn, after textTransform', async () => {
    await doc([text({ text: 'Summer sale', textTransform: 'uppercase' })], undefined, 2)

    const { text: layout } = leaves(await inspect({ root, project: 'p', name: 'hero' }))[0]!

    expect(layout!.lines.map((l) => l.text)).toEqual(['SUMMER SALE'])
  })

  it('reports the smaller font size AutoFit resolved to', async () => {
    await doc([text({ text: 'Big headline', fontSize: 80, height: 60, autoFit: { minFontSize: 10 } })])

    const { text: layout } = leaves(await inspect({ root, project: 'p', name: 'hero' }))[0]!

    expect(layout!.requestedFontSize).toBe(80)
    expect(layout!.fontSize).toBeLessThan(80)
    expect(layout!.fontSize).toBeGreaterThanOrEqual(10)
    expect(layout!.overflow).toBe(false)
    expect(layout!.lines.map((l) => l.text)).toEqual(['Big headline'])
  })

  it('flags text that still overflows at the minimum size, with a warning on the Layer', async () => {
    await doc([text({ text: 'Unbreakableword', width: 40, height: 20, autoFit: { minFontSize: 18 } })])

    const result = await inspect({ root, project: 'p', name: 'hero' })

    expect(leaves(result)[0]!.text).toMatchObject({ fontSize: 18, overflow: true })
    expect(result.warnings).toEqual([expect.objectContaining({ path: 'layers[0].text' })])
  })
})

describe('inspect: Groups', () => {
  async function grouped(layers: unknown[]) {
    await writeDocument({
      root,
      project: 'p',
      name: 'hero',
      document: { version: 2, name: 'hero', canvas: { width: 300, height: 250, background: '#ffffff' }, layers },
    })
  }

  it('nests each Group entry with its Box, its index in its parent and its children', async () => {
    await grouped([
      rect('a', { x: 0, y: 0, width: 10, height: 10 }),
      {
        id: 'group-1',
        type: 'group',
        name: 'Badge',
        layers: [
          rect('b', { x: 20, y: 30, width: 40, height: 10 }),
          { id: 'group-2', type: 'group', layers: [{ ...rect('c', { x: 50, y: 60, width: 20, height: 20 }), visible: false }] },
        ],
      },
    ])

    const result = await inspect({ root, project: 'p', name: 'hero' })

    expect(result.layers).toEqual([
      { index: 0, id: 'a', type: 'rect', extent: { x: 0, y: 0, width: 10, height: 10 }, placement: 'inside', selected: false },
      {
        index: 1,
        id: 'group-1',
        type: 'group',
        name: 'Badge',
        extent: { x: 20, y: 30, width: 50, height: 50 },
        placement: 'inside',
        selected: false,
        layers: [
          { index: 0, id: 'b', type: 'rect', extent: { x: 20, y: 30, width: 40, height: 10 }, placement: 'inside', selected: false },
          {
            index: 1,
            id: 'group-2',
            type: 'group',
            extent: { x: 50, y: 60, width: 20, height: 20 },
            placement: 'inside',
            selected: false,
            layers: [
              // Hidden, but still part of the Group's Box.
              { index: 0, id: 'c', type: 'rect', extent: { x: 50, y: 60, width: 20, height: 20 }, placement: 'inside', selected: false },
            ],
          },
        ],
      },
    ])
  })

  it('warns about leaves outside the Canvas, not about the Group holding them', async () => {
    await grouped([{ id: 'group-1', type: 'group', layers: [rect('in', { x: 0, y: 0, width: 10, height: 10 }), rect('gone', { x: 400, y: 0, width: 10, height: 10 })] }])

    const result = await inspect({ root, project: 'p', name: 'hero' })

    expect(result.layers[0]!.placement).toBe('partial')
    expect(result.warnings).toEqual([{ path: 'layers[0].layers[1]', message: 'Layer "gone" is entirely outside the Canvas' }])
  })

  it('marks a selected Group', async () => {
    await grouped([{ id: 'group-1', type: 'group', layers: [rect('a', { x: 0, y: 0, width: 10, height: 10 })] }])
    await writeSelection({ root, project: 'p', doc: 'hero', selectedLayerIds: ['group-1'] })

    const [entry] = (await inspect({ root, project: 'p', name: 'hero' })).layers

    expect(entry).toMatchObject({ id: 'group-1', selected: true, layers: [{ id: 'a', selected: false }] })
  })
})
