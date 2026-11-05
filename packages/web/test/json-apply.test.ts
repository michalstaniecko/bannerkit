// S2: applying JSON from the JSON panel. Invalid JSON is rejected with errors and the
// Document is left unchanged; valid JSON replaces the Document as one undo step.
import type { Document } from '@bannerkit/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, type ChangeEvent, type Editor } from '../src/editor/index.ts'
import { applyJson } from '../src/json-apply.ts'

const banner: Document = {
  version: 1,
  name: 'hero',
  canvas: { width: 400, height: 300, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x: 100, y: 100, width: 100, height: 50, fill: '#ff0000' }],
}

let editor: Editor | undefined
afterEach(async () => {
  await editor?.destroy()
  editor = undefined
  document.body.innerHTML = ''
})

async function open(document_: Document) {
  const container = document.createElement('div')
  document.body.append(container)
  editor = createEditor({ loadFonts: async () => {} })
  editor.mount(container)
  await editor.load(document_)
  const changes: ChangeEvent[] = []
  editor.on('change', (event) => changes.push(event))
  return { editor, changes }
}

describe('applyJson', () => {
  it('rejects a Document with a typo, with its path and a "did you mean" hint, and leaves the Document unchanged', async () => {
    const { editor, changes } = await open(banner)
    const typo = { ...banner, layers: [{ ...banner.layers[0], fil: '#00ff00' }] }

    const result = await applyJson(editor, JSON.stringify(typo))

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.objectContaining({ path: 'layers[0].fil', suggestion: 'fill' }))
    expect(editor.getDocument()).toEqual(banner)
    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })

  it('rejects text that is not JSON at all', async () => {
    const { editor, changes } = await open(banner)

    const result = await applyJson(editor, '{ "version": 1,')

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([expect.objectContaining({ path: '', message: expect.stringMatching(/JSON/) })])
    expect(editor.getDocument()).toEqual(banner)
    expect(changes).toEqual([])
  })

  it('applies a valid Document as one undo step', async () => {
    const { editor, changes } = await open(banner)
    const moved = { ...banner, layers: [{ ...banner.layers[0]!, x: 10, y: 20 }] } as Document

    const result = await applyJson(editor, JSON.stringify(moved, null, 2))

    expect(result).toEqual({ ok: true, errors: [] })
    expect(editor.getDocument()).toEqual(moved)
    expect(changes.map((c) => c.cause)).toEqual(['json'])
    await editor.undo()
    expect(editor.getDocument()).toEqual(banner)
    expect(editor.canUndo()).toBe(false)
  })
})
