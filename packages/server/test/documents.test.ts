import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDocument,
  createProject,
  duplicateDocument,
  listDocuments,
  readDocument,
  writeDocument,
} from '../src/ops/index.ts'
import { tempRoot } from './harness.ts'

let root: string
beforeEach(async () => {
  root = await tempRoot()
  await createProject({ root, name: 'p' })
})

const readDocFile = async (doc: string) =>
  JSON.parse(await readFile(join(root, 'p', 'documents', `${doc}.json`), 'utf8'))

describe('createDocument', () => {
  it('creates an empty Document sized from a Preset', async () => {
    const result = await createDocument({ root, project: 'p', name: 'hero', preset: '1200x628' })

    expect(result.path).toBe(join(root, 'p', 'documents', 'hero.json'))
    expect(await readDocFile('hero')).toEqual({
      $schema: expect.stringMatching(/document\.schema\.json$/),
      version: 2,
      name: 'hero',
      canvas: { width: 1200, height: 628, background: '#ffffff' },
      layers: [],
    })
    expect(result.document).toEqual(await readDocFile('hero'))
  })

  it.each([
    ['1200x628', 1200, 628],
    ['1080x1080', 1080, 1080],
    ['1080x1920', 1080, 1920],
    ['300x250', 300, 250],
    ['728x90', 728, 90],
  ] as const)('supports the %s Preset', async (preset, width, height) => {
    const { document } = await createDocument({ root, project: 'p', name: 'd', preset })

    expect(document.canvas).toMatchObject({ width, height })
  })

  it('creates a Document with a custom size', async () => {
    await createDocument({ root, project: 'p', name: 'odd', size: { width: 970, height: 250 } })

    expect((await readDocFile('odd')).canvas).toEqual({ width: 970, height: 250, background: '#ffffff' })
  })

  it('rejects an unknown Preset, a missing size and giving both', async () => {
    await expect(
      createDocument({ root, project: 'p', name: 'a', preset: '999x1' as never }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(createDocument({ root, project: 'p', name: 'a' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    await expect(
      createDocument({ root, project: 'p', name: 'a', preset: '728x90', size: { width: 1, height: 1 } }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('refuses to overwrite an existing Document', async () => {
    await createDocument({ root, project: 'p', name: 'hero', preset: '728x90' })

    await expect(createDocument({ root, project: 'p', name: 'hero', preset: '300x250' })).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
    })
    expect((await readDocFile('hero')).canvas.width).toBe(728)
  })

  it('fails with NOT_FOUND for a missing Project', async () => {
    await expect(createDocument({ root, project: 'nope', name: 'd', preset: '728x90' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('duplicateDocument', () => {
  const layers = [
    { id: 'rect-1', type: 'rect', x: 10, y: 20, width: 100, height: 50, fill: '#ff0000' },
    { id: 'rect-2', type: 'rect', x: 0, y: 0, width: 30, height: 30, fill: '#00ff00' },
  ]

  it('copies a Document onto another Preset with its Layers unchanged', async () => {
    await writeDocument({
      root,
      project: 'p',
      name: 'hero',
      document: { version: 1, name: 'hero', canvas: { width: 1200, height: 628, background: '#111111' }, layers },
    })

    const result = await duplicateDocument({ root, project: 'p', from: 'hero', name: 'square', preset: '1080x1080' })

    expect(result.name).toBe('square')
    expect(await readDocFile('square')).toEqual({
      $schema: expect.stringMatching(/document\.schema\.json$/),
      version: 2,
      name: 'square',
      canvas: { width: 1080, height: 1080, background: '#111111' },
      layers,
    })
    expect((await readDocFile('hero')).canvas.width).toBe(1200)
  })

  it('names the copy <from>-<W>x<H> by default and accepts a custom size', async () => {
    await createDocument({ root, project: 'p', name: 'hero', preset: '1200x628' })

    const result = await duplicateDocument({ root, project: 'p', from: 'hero', size: { width: 160, height: 600 } })

    expect(result.name).toBe('hero-160x600')
    expect((await readDocFile('hero-160x600')).canvas).toMatchObject({ width: 160, height: 600 })
  })

  it('fails with NOT_FOUND when the source Document is missing', async () => {
    await expect(duplicateDocument({ root, project: 'p', from: 'ghost', preset: '728x90' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('listDocuments', () => {
  it('discovers Documents by listing the documents folder', async () => {
    await createDocument({ root, project: 'p', name: 'b', preset: '728x90' })
    await createDocument({ root, project: 'p', name: 'a', preset: '300x250' })
    // A Document dropped in by hand (e.g. by an agent) is found without any registration step.
    await writeFile(
      join(root, 'p', 'documents', 'c.json'),
      JSON.stringify({ version: 1, name: 'c', canvas: { width: 1, height: 1, background: null }, layers: [] }),
    )
    await writeFile(join(root, 'p', 'documents', 'notes.txt'), 'ignored')

    const docs = await listDocuments({ root, project: 'p' })

    expect(docs.map((d) => d.name)).toEqual(['a', 'b', 'c'])
    expect(docs[0]).toEqual({ project: 'p', name: 'a', path: join(root, 'p', 'documents', 'a.json') })
  })
})

describe('writeDocument', () => {
  it('rejects an invalid Document and leaves the file untouched', async () => {
    await createDocument({ root, project: 'p', name: 'hero', preset: '728x90' })

    await expect(
      writeDocument({ root, project: 'p', name: 'hero', document: { version: 1, name: 'hero' } }),
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT', issues: expect.arrayContaining([expect.objectContaining({ path: 'canvas' })]) })
    expect((await readDocFile('hero')).canvas.width).toBe(728)
  })

  it('with an expected hash, writes only over that version of the file', async () => {
    const created = await createDocument({ root, project: 'p', name: 'hero', preset: '728x90' })
    const edited = { ...created.document, canvas: { ...created.document.canvas, background: '#000000' } }

    const saved = await writeDocument({ root, project: 'p', name: 'hero', document: edited, expectedHash: created.hash })

    expect(saved.hash).not.toBe(created.hash)
    await expect(
      writeDocument({ root, project: 'p', name: 'hero', document: created.document, expectedHash: created.hash }),
    ).rejects.toMatchObject({ code: 'CONFLICT', current: { document: edited, hash: saved.hash } })
    expect(await readDocFile('hero')).toEqual(edited)
  })

  it('without an expected hash, writes unconditionally', async () => {
    const created = await createDocument({ root, project: 'p', name: 'hero', preset: '728x90' })
    await writeDocument({ root, project: 'p', name: 'hero', document: { ...created.document, name: 'other' } })

    await writeDocument({ root, project: 'p', name: 'hero', document: created.document })

    expect(await readDocFile('hero')).toEqual(created.document)
  })

  it('leaves no temp files behind', async () => {
    await createDocument({ root, project: 'p', name: 'hero', preset: '728x90' })
    await writeDocument({ root, project: 'p', name: 'hero', document: await readDocFile('hero') })

    expect(await readdir(join(root, 'p', 'documents'))).toEqual(['hero.json'])
  })
})

describe('readDocument', () => {
  it('reports malformed JSON as INVALID_DOCUMENT', async () => {
    await writeFile(join(root, 'p', 'documents', 'broken.json'), '{ "version": 1,')

    await expect(readDocument({ root, project: 'p', name: 'broken' })).rejects.toMatchObject({
      code: 'INVALID_DOCUMENT',
    })
  })
})
