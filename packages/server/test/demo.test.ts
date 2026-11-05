// S1: the committed demo Project (examples/demo), copied into a temporary projects root.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Document } from '@bannerkit/core'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { listDocuments, render, validate } from '../src/ops/index.ts'
import { cli } from './cli-harness.ts'
import { seededRoot } from './harness.ts'
import { expectImageSnapshot } from './snapshot.ts'

const DEMO_SIZES = { hero: [1200, 628], square: [1080, 1080], rectangle: [300, 250] } as const

let root: string
beforeEach(async () => {
  root = await seededRoot()
})

describe('examples/demo', () => {
  it('holds three Documents at different Presets', async () => {
    const docs = await listDocuments({ root, project: 'demo' })
    expect(docs.map((d) => d.name).sort()).toEqual(Object.keys(DEMO_SIZES).sort())
  })

  it('uses rect, image and text Layers, with AutoFit text, in every Document', async () => {
    for (const name of Object.keys(DEMO_SIZES)) {
      const doc = JSON.parse(await readFile(join(root, 'demo', 'documents', `${name}.json`), 'utf8')) as Document
      const types = new Set(doc.layers.map((l) => l.type))
      expect([...types].sort(), name).toEqual(['image', 'rect', 'text'])
      expect(doc.layers.some((l) => l.type === 'text' && l.autoFit), `${name} has AutoFit text`).toBe(true)
      expect(doc.layers.filter((l) => l.type === 'image').length, `${name} has a product and a logo`).toBe(2)
    }
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
