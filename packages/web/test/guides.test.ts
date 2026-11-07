// Guides (Document v2) are not shown yet, but every editor step keeps them:
// they live on the Document, not on a Fabric object.
import { resizeCanvas } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect } from './editor-harness.ts'

const guides = { x: [0, 200], y: [150] }

const key = (key: string) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

describe('Guides in the editor', () => {
  it('survive a direct manipulation, its undo and redo', async () => {
    const { editor, changes } = await openEditor(doc([rect()], { guides }))
    editor.select(['rect-1'])

    key('ArrowRight')
    await editor.undo()
    await editor.redo()

    expect(changes.map((c) => c.document.guides)).toEqual([guides, guides, guides])
    expect(editor.getDocument().guides).toEqual(guides)
  })

  it('survive an Inspector edit and a reload from disk', async () => {
    const { editor } = await openEditor(doc([rect()], { guides }))

    await editor.update((d) => ({ ...d, layers: [{ ...d.layers[0]!, x: 5 }] }), { cause: 'inspector' })
    expect(editor.getDocument().guides).toEqual(guides)

    await editor.apply({ ...editor.getDocument(), guides: { x: [1], y: [] } }, { cause: 'reload' })
    expect(editor.getDocument().guides).toEqual({ x: [1], y: [] })
  })

  it('move with the Layers when the Canvas is resized', async () => {
    const { editor } = await openEditor(doc([rect()], { guides }))

    await editor.update((d) => resizeCanvas(d, { width: 600, height: 300 }, 'right'), { cause: 'resize' })

    expect(editor.getDocument().guides).toEqual({ x: [200, 400], y: [150] })
  })
})
