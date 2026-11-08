// S1: the committed demo Project (examples/demo), copied into a temporary projects root.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { layerExtent, walkLayers, type Document } from '@bannerkit/core'
import { measureText } from '../src/render/fonts.ts'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { listDocuments, render, validate } from '../src/ops/index.ts'
import { cli } from './cli-harness.ts'
import { seededRoot } from './harness.ts'
import { expectImageSnapshot } from './snapshot.ts'

const DEMO_SIZES = { hero: [1200, 628], square: [1080, 1080], rectangle: [300, 250], story: [1080, 1920] } as const

let root: string
beforeEach(async () => {
  root = await seededRoot()
})

describe('examples/demo', () => {
  it('holds four Documents at different Presets', async () => {
    const docs = await listDocuments({ root, project: 'demo' })
    expect(docs.map((d) => d.name).sort()).toEqual(Object.keys(DEMO_SIZES).sort())
  })

  it('keeps hero as a v1 file (reading v1) and shows v2 with Guides in story', async () => {
    const onDisk = async (name: string) => JSON.parse(await readFile(join(root, 'demo', 'documents', `${name}.json`), 'utf8'))

    expect((await onDisk('hero')).version).toBe(1)
    expect(await onDisk('story')).toMatchObject({ version: 2, guides: { x: expect.any(Array), y: expect.any(Array) } })
  })

  it('shows uppercase text (textTransform) in story', async () => {
    const story = JSON.parse(await readFile(join(root, 'demo', 'documents', 'story.json'), 'utf8')) as Document

    expect(walkLayers(story).some(({ layer }) => layer.type === 'text' && layer.textTransform === 'uppercase')).toBe(true)
  })

  it('uses rect, image and text Layers, with AutoFit text, in every Document', async () => {
    for (const name of Object.keys(DEMO_SIZES)) {
      const doc = JSON.parse(await readFile(join(root, 'demo', 'documents', `${name}.json`), 'utf8')) as Document
      const layers = walkLayers(doc).map((v) => v.layer)
      const types = new Set(layers.map((l) => l.type).filter((t) => t !== 'group'))
      expect([...types].sort(), name).toEqual(['image', 'rect', 'text'])
      expect(layers.some((l) => l.type === 'text' && l.autoFit), `${name} has AutoFit text`).toBe(true)
      expect(layers.filter((l) => l.type === 'image').length, `${name} has a product and a logo`).toBe(2)
    }
  })

  it('shows a Group with opacity whose children overlap in story', async () => {
    const doc = JSON.parse(await readFile(join(root, 'demo', 'documents', 'story.json'), 'utf8')) as Document
    const group = doc.layers.find((l) => l.type === 'group')

    expect(group?.opacity).toBeLessThan(1)
    const [a, b] = group!.type === 'group' ? group!.layers.map((l) => layerExtent(l, measureText)) : []
    expect(a!.x < b!.x + b!.width && b!.x < a!.x + a!.width && a!.y < b!.y + b!.height && b!.y < a!.y + a!.height).toBe(true)
  })

  it('validates with no errors and no overflow warnings', async () => {
    const result = await validate({ root, project: 'demo' })
    expect(result.documents.map((d) => [d.name, d.errors, d.warnings])).toEqual(
      Object.keys(DEMO_SIZES)
        .sort()
        .map((name) => [name, [], []]),
    )
    expect(result.ok).toBe(true)
  })

  it('renders every Document at its exact size and matches the committed snapshots', async () => {
    const { files } = await render({ root, project: 'demo' })
    expect(files.map((f) => [f.name, f.width, f.height])).toEqual(
      Object.entries(DEMO_SIZES)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, [w, h]]) => [name, w, h]),
    )
    for (const file of files) {
      const png = await readFile(file.path)
      const meta = await sharp(png).metadata()
      expect([meta.width, meta.height]).toEqual([file.width, file.height])
      await expectImageSnapshot(`demo-${file.name}`, png, { maxDiffRatio: 0.005 })
    }
  })

  it('works through `bannerkit validate` and `bannerkit render`', async () => {
    const validated = await cli(['validate', 'demo', '--root', root, '--json'])
    expect(validated.exitCode, validated.stderr).toBe(0)
    expect(validated.json().ok).toBe(true)

    const rendered = await cli(['render', 'demo', '--root', root, '--size', '300x250', '--json'])
    expect(rendered.exitCode, rendered.stderr).toBe(0)
    expect(rendered.json().result.files.map((f: { name: string }) => f.name)).toEqual(['rectangle'])
  })
})
