// REST routes behind the editor's toolbar and top bar: Asset upload (multipart, the
// `addAssets` op), new Document from a Preset and duplicate to another size (the
// `createDocument` / `duplicateDocument` ops). Exercised in-process via `app.request`.
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Document } from '@bannerkit/core'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { createProject, writeDocument } from '../src/ops/index.ts'
import { createApp } from '../src/rest/app.ts'
import { tempRoot } from './harness.ts'

const hero: Document = {
  version: 1,
  name: 'hero',
  canvas: { width: 300, height: 250, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x: 10, y: 20, width: 100, height: 50, fill: '#ff0000' }],
}

let root: string
beforeEach(async () => {
  root = await tempRoot()
  await createProject({ root, name: 'summer' })
  await writeDocument({ root, project: 'summer', name: 'hero', document: hero })
})

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer()

const upload = async (files: { name: string; data: Uint8Array }[], project = 'summer') => {
  const form = new FormData()
  for (const { name, data } of files) form.append('file', new File([new Uint8Array(data)], name))
  const res = await createApp({ root }).request(`/api/projects/${project}/assets`, { method: 'POST', body: form })
  return { status: res.status, body: (await res.json()) as any }
}

const postJson = async (path: string, body: unknown) => {
  const res = await createApp({ root }).request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as any }
}

describe('REST: uploading Assets', () => {
  it('ingests multipart files like the CLI: sanitised, de-duplicated names and intrinsic sizes', async () => {
    const first = await upload([{ name: 'My Shoe.PNG', data: await png(8, 6) }])
    const second = await upload([{ name: 'my shoe.png', data: await png(4, 4) }])

    expect(first.status).toBe(201)
    expect(first.body.assets).toEqual([expect.objectContaining({ src: 'assets/my-shoe.png', format: 'png', width: 8, height: 6 })])
    expect(second.body.assets[0].src).toBe('assets/my-shoe-1.png')
    expect((await readdir(join(root, 'summer', 'assets'))).sort()).toEqual(['my-shoe-1.png', 'my-shoe.png'])
  })

  it('refuses a file that is not an image with 415 and writes nothing', async () => {
    const { status, body } = await upload([{ name: 'notes.png', data: new TextEncoder().encode('hello') }])

    expect(status).toBe(415)
    expect(body.error.code).toBe('UNSUPPORTED_ASSET')
    expect(await readdir(join(root, 'summer', 'assets'))).toEqual([])
  })

  it('refuses a request without files with 400, and a missing Project with 404', async () => {
    const empty = await createApp({ root }).request('/api/projects/summer/assets', { method: 'POST', body: new FormData() })
    expect(empty.status).toBe(400)

    expect((await upload([{ name: 'a.png', data: await png(2, 2) }], 'winter')).status).toBe(404)
  })
})

describe('REST: creating and duplicating Documents', () => {
  it('creates an empty Document from a Preset', async () => {
    const { status, body } = await postJson('/api/projects/summer/documents', { name: 'square', preset: '1080x1080' })

    expect(status).toBe(201)
    expect(body).toMatchObject({ name: 'square', document: { canvas: { width: 1080, height: 1080 }, layers: [] } })
    const onDisk = JSON.parse(await readFile(join(root, 'summer', 'documents', 'square.json'), 'utf8'))
    expect(onDisk.canvas).toMatchObject({ width: 1080, height: 1080 })
  })

  it('refuses an existing name with 409 and an unknown Preset with 400', async () => {
    expect((await postJson('/api/projects/summer/documents', { name: 'hero', preset: '300x250' })).status).toBe(409)
    expect((await postJson('/api/projects/summer/documents', { name: 'x', preset: '1x1' })).status).toBe(400)
  })

  it('duplicates a Document onto another Preset with its Layers unchanged', async () => {
    const { status, body } = await postJson('/api/projects/summer/documents/hero/duplicate', { preset: '728x90' })

    expect(status).toBe(201)
    expect(body).toMatchObject({ name: 'hero-728x90', document: { canvas: { width: 728, height: 90 }, layers: hero.layers } })
  })

  it('duplicates to a chosen name, and answers a missing source with 404', async () => {
    const named = await postJson('/api/projects/summer/documents/hero/duplicate', { name: 'tall', preset: '1080x1920' })
    expect(named.body.name).toBe('tall')

    expect((await postJson('/api/projects/summer/documents/nope/duplicate', { preset: '728x90' })).status).toBe(404)
  })
})
