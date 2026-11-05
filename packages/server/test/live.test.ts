// Live reload (spec: SSE): a recursive watcher on the projects root streams
// `document-changed { project, doc, hash }` to every editor on GET /api/events.
// The hash is the one the REST read and save answer with, so an editor can tell
// its own autosave echo from an agent's change.
import { createHash } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Document } from '@bannerkit/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createProject, writeDocument } from '../src/ops/index.ts'
import { createApp } from '../src/rest/app.ts'
import { watchDocuments, type DocumentChanged } from '../src/rest/live.ts'
import { tempRoot } from './harness.ts'

const hero: Document = {
  version: 1,
  name: 'hero',
  canvas: { width: 300, height: 250, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x: 10, y: 20, width: 100, height: 50, fill: '#ff0000' }],
}

type Changed = DocumentChanged

/** Opens the SSE stream and collects `document-changed` events until `close`. */
async function listen(app: ReturnType<typeof createApp>) {
  const res = await app.request('/api/events')
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/event-stream')
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  const events: Changed[] = []
  let buffer = ''
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const type = /^event: (.*)$/m.exec(frame)?.[1]
        const data = /^data: (.*)$/m.exec(frame)?.[1]
        if (type === 'document-changed' && data) events.push(JSON.parse(data))
      }
    }
  })()
  // Let the watcher start before the test touches the disk.
  await new Promise((resolve) => setTimeout(resolve, 100))
  return {
    events,
    close: async () => {
      await reader.cancel()
      await pump
    },
  }
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms))

let root: string
beforeEach(async () => {
  root = await tempRoot()
  await createProject({ root, name: 'summer' })
  await writeDocument({ root, project: 'summer', name: 'hero', document: hero })
})

describe('SSE: document-changed', () => {
  it('streams a change to a Document file, with the hash of its bytes', async () => {
    const app = createApp({ root })
    const stream = await listen(app)
    const path = join(root, 'summer', 'documents', 'hero.json')

    await writeFile(path, JSON.stringify({ ...hero, layers: [] }, null, 2))

    await expect.poll(() => stream.events.length, { timeout: 3000 }).toBeGreaterThan(0)
    await settle()
    expect(stream.events).toEqual([{ project: 'summer', doc: 'hero', hash: sha256(await readFile(path)) }])
    await stream.close()
  })

  it('sends one event for an atomic write and ignores its temp file', async () => {
    const app = createApp({ root })
    const stream = await listen(app)

    await writeDocument({ root, project: 'summer', name: 'hero', document: { ...hero, layers: [] } })

    await expect.poll(() => stream.events.length, { timeout: 3000 }).toBeGreaterThan(0)
    await settle()
    expect(stream.events.map((e) => e.doc)).toEqual(['hero'])
    await stream.close()
  })

  it('ignores files that are not Documents', async () => {
    const app = createApp({ root })
    const stream = await listen(app)

    await writeFile(join(root, 'summer', 'notes.json'), '{}')
    await writeFile(join(root, 'summer', 'documents', 'readme.txt'), 'hi')
    await writeFile(join(root, 'summer', 'assets', 'logo.svg'), '<svg/>')
    await settle(600)

    expect(stream.events).toEqual([])
    await stream.close()
  })

  it('does not report a deleted Document', async () => {
    const app = createApp({ root })
    const stream = await listen(app)

    await rm(join(root, 'summer', 'documents', 'hero.json'))
    await settle(600)

    expect(stream.events).toEqual([])
    await stream.close()
  })
})

describe('watchDocuments', () => {
  it('reports nothing once stopped, so a stopped server holds no watcher', async () => {
    const changes: Changed[] = []
    const stop = watchDocuments(root, (change) => changes.push(change))
    await settle(100)
    await writeFile(join(root, 'summer', 'documents', 'hero.json'), JSON.stringify({ ...hero, layers: [] }))
    await expect.poll(() => changes.length, { timeout: 3000 }).toBe(1)

    stop()
    await writeFile(join(root, 'summer', 'documents', 'hero.json'), JSON.stringify(hero))
    await settle()

    expect(changes).toHaveLength(1)
  })
})

describe('REST: content hashes', () => {
  it('answers a read and a save with the hash of the bytes on disk, the hash the stream sends', async () => {
    const app = createApp({ root })
    const path = join(root, 'summer', 'documents', 'hero.json')

    const read = (await (await app.request('/api/projects/summer/documents/hero')).json()) as { hash: string }
    expect(read.hash).toBe(sha256(await readFile(path)))

    const saved = (await (
      await app.request('/api/projects/summer/documents/hero', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...hero, layers: [] }),
      })
    ).json()) as { hash: string }
    expect(saved.hash).toBe(sha256(await readFile(path)))
    expect(saved.hash).not.toBe(read.hash)
  })
})
