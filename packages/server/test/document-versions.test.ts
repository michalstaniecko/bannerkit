// Document v2 and lazy migration (spec #3, Q1/Q3/Q7): v1 files are read as v2
// without being rewritten; the first write of a change writes v2.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { duplicateDocument, readDocument, resizeDocument, writeDocument } from '../src/ops/index.ts'
import { createApp } from '../src/rest/app.ts'
import { cli } from './cli-harness.ts'
import { seededRoot } from './harness.ts'

const heroPath = (root: string) => join(root, 'demo', 'documents', 'hero.json')
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

describe('a v1 Document on disk', () => {
  it('is read as v2, hashed by its bytes on disk', async () => {
    const root = await seededRoot()
    const bytes = await readFile(heroPath(root))
    expect(JSON.parse(bytes.toString('utf8')).version).toBe(1)

    const result = await readDocument({ root, project: 'demo', name: 'hero' })

    expect(result.document.version).toBe(2)
    expect(result.hash).toBe(sha256(bytes))
  })

  it('is not rewritten by validate, inspect, preview or render', async () => {
    const root = await seededRoot()
    const before = await readFile(heroPath(root))

    for (const argv of [
      ['validate', 'demo'],
      ['inspect', 'demo', 'hero'],
      ['preview', 'demo', 'hero'],
      ['render', 'demo', '--doc', 'hero'],
    ]) {
      const run = await cli([...argv, '--root', root, '--json'])
      expect(run.exitCode, argv.join(' ')).toBe(0)
    }

    expect(await readFile(heroPath(root))).toEqual(before)
  })

  it('is written as v2 by the first change', async () => {
    const root = await seededRoot()

    await resizeDocument({ root, project: 'demo', name: 'hero', size: { width: 1200, height: 700 } })

    const written = JSON.parse(await readFile(heroPath(root), 'utf8'))
    expect(written.version).toBe(2)
    expect(written.$schema).toBe('../../../packages/core/schema/document.schema.json')
  })

  it('is served as v2 over REST, and saves with If-Match against the v1 bytes', async () => {
    const root = await seededRoot()
    const app = createApp({ root })
    const url = '/api/projects/demo/documents/hero'
    const bytes = await readFile(heroPath(root))

    const loaded = (await (await app.request(url)).json()) as any
    const saved = await app.request(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': `"${loaded.hash}"` },
      body: JSON.stringify(loaded.document),
    })

    expect(loaded.document.version).toBe(2)
    expect(loaded.hash).toBe(sha256(bytes))
    expect(saved.status).toBe(200)
    expect(JSON.parse(await readFile(heroPath(root), 'utf8')).version).toBe(2)
  })

  it('with a v2 field is invalid, with a hint to migrate', async () => {
    const root = await seededRoot()
    const hero = JSON.parse(await readFile(heroPath(root), 'utf8'))
    await writeFile(heroPath(root), JSON.stringify({ ...hero, guides: { x: [], y: [] } }))

    const run = await cli(['validate', 'demo', '--root', root, '--json'])

    expect(run.exitCode).toBe(1)
    expect(run.json().result.documents.find((d: any) => d.name === 'hero').errors).toEqual([
      { path: 'guides', message: '"guides" requires version: 2; run `bannerkit migrate`' },
    ])
  })
})

describe('Guides', () => {
  const withGuides = async (root: string) => {
    const { document } = await readDocument({ root, project: 'demo', name: 'hero' })
    await writeDocument({ root, project: 'demo', name: 'hero', document: { ...document, guides: { x: [600], y: [0, 314] } } })
  }

  it('move with the Layers when the Canvas is resized around an Anchor', async () => {
    const root = await seededRoot()
    await withGuides(root)

    const { document } = await resizeDocument({ root, project: 'demo', name: 'hero', size: { width: 1400, height: 828 }, anchor: 'center' })

    expect(document.guides).toEqual({ x: [700], y: [100, 414] })
  })

  it('are copied unchanged by doc duplicate', async () => {
    const root = await seededRoot()
    await withGuides(root)

    const { document } = await duplicateDocument({ root, project: 'demo', from: 'hero', size: { width: 300, height: 250 } })

    expect(document.version).toBe(2)
    expect(document.guides).toEqual({ x: [600], y: [0, 314] })
  })

  it('never reach the Render', async () => {
    const root = await seededRoot()
    const plain = await cli(['preview', 'demo', 'hero', '--root', root, '--json'])
    const plainPng = await readFile(plain.json().result.path)
    await withGuides(root)

    const guided = await cli(['preview', 'demo', 'hero', '--root', root, '--json'])

    expect(await readFile(guided.json().result.path)).toEqual(plainPng)
  })
})
