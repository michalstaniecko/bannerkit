// S3: `editor.preview`, a transient change shown on the Canvas (jsdom + node-canvas).
// While it shows there is no undo step and no `change` (so no autosave); `commit`
// makes it exactly one step and one `change`, `cancel` shows the Document from
// before the gesture again, and any other step (a reload from disk) drops it.
import type { Document } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect } from './editor-harness.ts'

const moveTo = (x: number) => (d: Document): Document => ({ ...d, layers: d.layers.map((l) => ({ ...l, x })) })

describe('preview', () => {
  it('shows each recipe on the Document from before the gesture, without a step or change', async () => {
    const { editor, changes } = await openEditor(doc([rect()]))
    editor.select(['rect-1'])
    const preview = editor.preview()

    await preview.show(moveTo(150))
    await preview.show(moveTo(130))

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 130, y: 100 })
    expect(editor.getSelection()).toEqual(['rect-1'])
    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })

  it('commit makes what shows exactly one undo step and one change with its cause', async () => {
    const original = doc([rect()])
    const { editor, changes } = await openEditor(original)
    const preview = editor.preview()
    await preview.show(moveTo(150))
    await preview.show(moveTo(130))

    await preview.commit({ cause: 'inspector' })

    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([['inspector', ['rect-1']]])
    expect(changes[0]!.document.layers[0]).toMatchObject({ x: 130 })
    expect(preview.ended()).toBe(true)
    await editor.undo()
    expect(editor.getDocument()).toEqual(original)
    expect(editor.canUndo()).toBe(false)
  })

  it('commit records nothing when the preview ends where it started', async () => {
    const { editor, changes } = await openEditor(doc([rect()]))
    const preview = editor.preview()
    await preview.show(moveTo(150))
    await preview.show(moveTo(100))

    await preview.commit({ cause: 'inspector' })

    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })

  it('cancel shows the Document from before the gesture again, without a step', async () => {
    const original = doc([rect()])
    const { editor, changes } = await openEditor(original)
    editor.select(['rect-1'])
    const preview = editor.preview()
    await preview.show(moveTo(150))

    await preview.cancel()
    await preview.show(moveTo(170))
    await preview.commit({ cause: 'inspector' })

    expect(editor.getDocument()).toEqual(original)
    expect(editor.getSelection()).toEqual(['rect-1'])
    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })

  it('a reload from disk drops the preview: the reload applies, a later commit does nothing', async () => {
    const { editor, changes } = await openEditor(doc([rect(), rect({ id: 'rect-2', x: 250 })]))
    const preview = editor.preview()
    await preview.show(moveTo(150))

    await editor.update((d) => ({ ...d, layers: [d.layers[0]!, { ...d.layers[1]!, y: 10 }] }), { cause: 'reload' })
    await preview.show(moveTo(170))
    await preview.commit({ cause: 'inspector' })

    expect(preview.ended()).toBe(true)
    expect(editor.getDocument().layers.map((l) => [l.x, l.y])).toEqual([[100, 100], [250, 10]])
    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([['reload', ['rect-2']]])
  })

  it('undo during a preview drops it and undoes the step before', async () => {
    const original = doc([rect()])
    const { editor } = await openEditor(original)
    await editor.update(moveTo(120), { cause: 'inspector' })
    const preview = editor.preview()
    await preview.show(moveTo(150))

    await editor.undo()

    expect(preview.ended()).toBe(true)
    expect(editor.getDocument()).toEqual(original)
  })

  it('a new preview drops the one running', async () => {
    const { editor, changes } = await openEditor(doc([rect()]))
    const first = editor.preview()
    await first.show(moveTo(150))

    const second = editor.preview()
    await second.show((d) => ({ ...d, layers: d.layers.map((l) => ({ ...l, y: 20 })) }))
    await second.commit({ cause: 'inspector' })

    expect(first.ended()).toBe(true)
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 20 })
    expect(changes).toHaveLength(1)
  })
  it('a new preview starts from the Document before a dropped one that changed the Layers', async () => {
    const original = doc([rect(), rect({ id: 'rect-2', x: 250 })])
    const { editor, changes } = await openEditor(original)
    const first = editor.preview()
    await first.show((d) => ({ ...d, layers: [d.layers[0]!] }))

    const second = editor.preview()
    await second.show(moveTo(150))
    await second.cancel()

    expect(editor.getDocument()).toEqual(original)
    expect(changes).toEqual([])
  })
})
