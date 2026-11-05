// The REST adapter (ADR 0005): a thin Hono app over the same operations as the CLI.
// Exercised in-process through `app.request`, against a temporary projects root.
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
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
  await createProject({ root, name: 'autumn' })
  await writeDocument({ root, project: 'summer', name: 'hero', document: hero })
  await writeDocument({ root, project: 'summer', name: 'banner', document: { ...hero, name: 'banner' } })
})

const getJson = async (app: ReturnType<typeof createApp>, path: string) => {
  const res = await app.request(path)
  return { status: res.status, body: (await res.json()) as any }
}

describe('REST: Projects and Documents', () => {
  it('lists Projects', async () => {
    const { status, body } = await getJson(createApp({ root }), '/api/projects')

    expect(status).toBe(200)
    expect(body.map((p: { name: string }) => p.name)).toEqual(['autumn', 'summer'])
  })

  it('lists the Documents of a Project', async () => {
    const { status, body } = await getJson(createApp({ root }), '/api/projects/summer/documents')

    expect(status).toBe(200)
    expect(body.map((d: { name: string }) => d.name)).toEqual(['banner', 'hero'])
  })

  it('reads a Document', async () => {
    const { status, body } = await getJson(createApp({ root }), '/api/projects/summer/documents/hero')

    expect(status).toBe(200)
    expect(body).toMatchObject({ project: 'summer', name: 'hero', document: hero })
  })

  it('answers a missing Project or Document with 404 and the op error', async () => {
    const app = createApp({ root })

    const project = await getJson(app, '/api/projects/winter/documents')
    const doc = await getJson(app, '/api/projects/summer/documents/nope')

    expect(project).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: expect.stringContaining('winter'), issues: [] } },
    })
    expect(doc.status).toBe(404)
    expect(doc.body.error.code).toBe('NOT_FOUND')
  })

  it('answers an unsafe name with 400', async () => {
    const { status, body } = await getJson(createApp({ root }), '/api/projects/.hidden/documents')

    expect(status).toBe(400)
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('answers an invalid Document on disk with 422 and its issues', async () => {
    await writeFile(join(root, 'summer', 'documents', 'broken.json'), JSON.stringify({ ...hero, version: 2 }))

    const { status, body } = await getJson(createApp({ root }), '/api/projects/summer/documents/broken')

    expect(status).toBe(422)
    expect(body.error.code).toBe('INVALID_DOCUMENT')
    expect(body.error.issues[0].path).toBe('version')
  })

  it('answers unknown API routes with a JSON 404', async () => {
    const { status, body } = await getJson(createApp({ root }), '/api/nothing-here')

    expect(status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })
})

describe('REST: creating a Project', () => {
  const post = (app: ReturnType<typeof createApp>, body: string) =>
    app.request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body })

  it('creates a Project via the createProject op and answers 201', async () => {
    const app = createApp({ root })

    const res = await post(app, JSON.stringify({ name: 'winter' }))

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ name: 'winter' })
    expect((await getJson(app, '/api/projects')).body.map((p: { name: string }) => p.name)).toEqual(['autumn', 'summer', 'winter'])
  })

  it('refuses an existing name with 409 and a bad body with 400', async () => {
    const app = createApp({ root })

    expect((await post(app, JSON.stringify({ name: 'summer' }))).status).toBe(409)
    expect((await post(app, JSON.stringify({ name: '.hidden' }))).status).toBe(400)
    expect((await post(app, '{')).status).toBe(400)
    expect((await post(app, '[]')).status).toBe(400)
  })
})

describe('REST: missing Assets are warnings for the editor', () => {
  const withImage = (src: string): Document => ({
    ...hero,
    layers: [...hero.layers, { id: 'image-1', type: 'image', x: 0, y: 0, width: 50, height: 50, src, fit: 'cover' }],
  })
  const missing = { path: 'layers[1].src', message: 'Asset "assets/gone.png" not found in Project "summer"' }

  it('reads a Document whose image src is missing, with a warning instead of a 422', async () => {
    await writeFile(join(root, 'summer', 'documents', 'hero.json'), JSON.stringify(withImage('assets/gone.png')))

    const { status, body } = await getJson(createApp({ root }), '/api/projects/summer/documents/hero')

    expect(status).toBe(200)
    expect(body.document).toEqual(withImage('assets/gone.png'))
    expect(body.warnings).toEqual([missing])
  })

  it('reports no warnings for a Document whose Assets all exist', async () => {
    const { body } = await getJson(createApp({ root }), '/api/projects/summer/documents/hero')

    expect(body.warnings).toEqual([])
  })
})

describe('REST: saving a Document', () => {
  const put = (app: ReturnType<typeof createApp>, path: string, body: unknown) =>
    app.request(path, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  const onDisk = async (name: string) => JSON.parse(await readFile(join(root, 'summer', 'documents', `${name}.json`), 'utf8'))
  const moved: Document = { ...hero, layers: [{ ...hero.layers[0]!, x: 42 }] }

  it('writes the whole Document and answers with it', async () => {
    const res = await put(createApp({ root }), '/api/projects/summer/documents/hero', moved)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ project: 'summer', name: 'hero', document: moved, warnings: [] })
    expect(await onDisk('hero')).toEqual(moved)
  })

  const withMissing: Document = {
    ...hero,
    layers: [...hero.layers, { id: 'image-1', type: 'image', x: 0, y: 0, width: 50, height: 50, src: 'assets/gone.png', fit: 'cover' }],
  }

  it('saves a Document whose image src was already missing on disk, with a warning', async () => {
    await writeFile(join(root, 'summer', 'documents', 'hero.json'), JSON.stringify(withMissing))
    const edited: Document = { ...withMissing, layers: [{ ...hero.layers[0]!, x: 42 }, withMissing.layers[1]!] }

    const res = await put(createApp({ root }), '/api/projects/summer/documents/hero', edited)

    expect(res.status).toBe(200)
    expect(((await res.json()) as any).warnings).toEqual([
      { path: 'layers[1].src', message: 'Asset "assets/gone.png" not found in Project "summer"' },
    ])
    expect(await onDisk('hero')).toEqual(edited)
  })

  it.each([
    ['a new Layer', withMissing],
    ['a changed src', { ...withMissing, layers: [hero.layers[0]!, { ...withMissing.layers[1]!, src: 'assets/gnoe.png' }] }],
  ])('refuses a missing src on %s with 422 at its path', async (_, document) => {
    if (document !== withMissing) await writeFile(join(root, 'summer', 'documents', 'hero.json'), JSON.stringify(withMissing))
    const before = await onDisk('hero')

    const res = await put(createApp({ root }), '/api/projects/summer/documents/hero', document)

    expect(res.status).toBe(422)
    expect(((await res.json()) as any).error.issues).toEqual([expect.objectContaining({ path: 'layers[1].src' })])
    expect(await onDisk('hero')).toEqual(before)
  })

  it('with If-Match, saves over that version only; a changed file answers 409 with it', async () => {
    const app = createApp({ root })
    const { body: loaded } = await getJson(app, '/api/projects/summer/documents/hero')
    const ifMatch = (hash: string) => ({ 'content-type': 'application/json', 'if-match': `"${hash}"` })

    const saved = await app.request('/api/projects/summer/documents/hero', { method: 'PUT', headers: ifMatch(loaded.hash), body: JSON.stringify(moved) })
    const savedBody = (await saved.json()) as any
    const stale = await app.request('/api/projects/summer/documents/hero', { method: 'PUT', headers: ifMatch(loaded.hash), body: JSON.stringify(hero) })

    expect(saved.status).toBe(200)
    expect(stale.status).toBe(409)
    expect(((await stale.json()) as any).error).toMatchObject({ code: 'CONFLICT', current: { document: moved, hash: savedBody.hash } })
    expect(await onDisk('hero')).toEqual(moved)
  })

  it.each([
    ['an invalid Document', { ...hero, version: 2 }, 'version'],
    ['a src outside the Project', { ...hero, layers: [{ id: 'i', type: 'image', x: 0, y: 0, width: 1, height: 1, src: '../x.png', fit: 'cover' }] }, 'layers[0].src'],
  ])('refuses %s with 422 and leaves the file alone', async (_, document, path) => {
    const res = await put(createApp({ root }), '/api/projects/summer/documents/hero', document)

    expect(res.status).toBe(422)
    expect(((await res.json()) as any).error.issues[0].path).toBe(path)
    expect(await onDisk('hero')).toEqual(hero)
  })

  it('refuses a body that is not JSON with 400', async () => {
    const res = await put(createApp({ root }), '/api/projects/summer/documents/hero', '{nope')

    expect(res.status).toBe(400)
    expect(((await res.json()) as any).error.code).toBe('INVALID_INPUT')
    expect(await onDisk('hero')).toEqual(hero)
  })

  it('answers a missing Project with 404', async () => {
    const res = await put(createApp({ root }), '/api/projects/winter/documents/hero', hero)

    expect(res.status).toBe(404)
  })
})

describe('REST: Assets', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex')

  beforeEach(async () => {
    await mkdir(join(root, 'summer', 'assets', 'logos'), { recursive: true })
    await writeFile(join(root, 'summer', 'assets', 'logos', 'mark.png'), png)
  })

  it('serves a Project Asset at the project-relative src path', async () => {
    const res = await createApp({ root }).request('/api/projects/summer/assets/logos/mark.png')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await res.arrayBuffer())).toEqual(png)
  })

  it.each([
    '/api/projects/summer/assets/missing.png',
    '/api/projects/summer/assets/%2e%2e/project.json',
    '/api/projects/summer/assets/..%2fproject.json',
    '/api/projects/.hidden/assets/mark.png',
  ])('answers %s with 404 and never leaves the assets folder', async (path) => {
    const res = await createApp({ root }).request(path)

    expect(res.status).toBe(404)
  })
})

describe('REST: the built editor from the same origin', () => {
  let webDir: string
  beforeEach(async () => {
    webDir = await mkdtemp(join(root, 'web-'))
    await writeFile(join(webDir, 'index.html'), '<!doctype html><title>Bannerkit</title>')
    await mkdir(join(webDir, 'assets'))
    await writeFile(join(webDir, 'assets', 'app.js'), 'console.log(1)')
  })

  it('serves index.html at / and the bundle next to it', async () => {
    const app = createApp({ root, webDir })

    const index = await app.request('/')
    const bundle = await app.request('/assets/app.js')

    expect(index.status).toBe(200)
    expect(await index.text()).toContain('<title>Bannerkit</title>')
    expect(bundle.status).toBe(200)
    expect(bundle.headers.get('content-type')).toMatch(/javascript/)
  })

  it('still answers the API alongside the editor', async () => {
    const { status } = await getJson(createApp({ root, webDir }), '/api/projects')

    expect(status).toBe(200)
  })
})

describe('REST: Render', () => {
  const post = (app: ReturnType<typeof createApp>, path: string, body?: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  it('renders one Document via the render op and answers with the image', async () => {
    const res = await post(createApp({ root }), '/api/projects/summer/documents/hero/render', { format: 'jpg', scale: 2 })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 600, 500])
    expect(await readdir(join(root, 'summer', 'exports'))).toEqual(['hero.300x250@2x.jpg'])
  })

  it('renders one Document as PNG at 1x by default', async () => {
    const res = await post(createApp({ root }), '/api/projects/summer/documents/hero/render')

    expect(res.headers.get('content-type')).toBe('image/png')
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 300, 250])
  })

  it('batch-renders a Project, filtered like the CLI, and lists the files', async () => {
    const res = await post(createApp({ root }), '/api/projects/summer/render', { docs: ['banner'], format: 'webp' })
    const body = (await res.json()) as any

    expect(res.status).toBe(200)
    expect(body.project).toBe('summer')
    expect(body.files.map((f: { name: string; width: number; format: string }) => [f.name, f.width, f.format])).toEqual([
      ['banner', 300, 'webp'],
    ])
    expect(await readdir(join(root, 'summer', 'exports'))).toEqual(['banner.300x250.webp'])
  })

  it('answers bad render options with 400 and a missing Document with 404', async () => {
    const app = createApp({ root })

    const bad = await post(app, '/api/projects/summer/documents/hero/render', { scale: 3 })
    const notJson = await app.request('/api/projects/summer/render', { method: 'POST', body: '{' })
    const missing = await post(app, '/api/projects/summer/documents/nope/render', {})

    expect(bad.status).toBe(400)
    expect(((await bad.json()) as any).error.issues[0].path).toBe('scale')
    expect(notJson.status).toBe(400)
    expect(missing.status).toBe(404)
  })
})

describe('REST: the Selection', () => {
  const putSelection = (app: ReturnType<typeof createApp>, project: string, body: string) =>
    app.request(`/api/projects/${project}/selection`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body })

  it('reads null before the editor records a Selection', async () => {
    expect(await getJson(createApp({ root }), '/api/projects/summer/selection')).toEqual({ status: 200, body: null })
  })

  it('records the Selection in .state.json and reads it back', async () => {
    const app = createApp({ root })

    const res = await putSelection(app, 'summer', JSON.stringify({ doc: 'hero', selectedLayerIds: ['rect-1'] }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ doc: 'hero', selectedLayerIds: ['rect-1'] })
    expect(JSON.parse(await readFile(join(root, 'summer', '.state.json'), 'utf8'))).toEqual({
      doc: 'hero',
      selectedLayerIds: ['rect-1'],
    })
    expect(await getJson(app, '/api/projects/summer/selection')).toEqual({
      status: 200,
      body: { doc: 'hero', selectedLayerIds: ['rect-1'] },
    })
  })

  it('refuses a Selection in a missing Document with 404, and a malformed one with 400', async () => {
    const app = createApp({ root })

    const missing = await putSelection(app, 'summer', JSON.stringify({ doc: 'nope', selectedLayerIds: [] }))
    const malformed = await putSelection(app, 'summer', JSON.stringify({ doc: 'hero', selectedLayerIds: 'rect-1' }))
    const notJson = await putSelection(app, 'summer', '{')

    expect(missing.status).toBe(404)
    expect(malformed.status).toBe(400)
    expect(notJson.status).toBe(400)
  })
})
