// S2: the editor's `canvas` event (jsdom + node-canvas). Whenever a step, an undo, a
// redo, a reload or a load leaves a different Canvas size shown, the editor says so
// once, so Fit mode can zoom to it again. A preview (a resize handle being dragged)
// does not: the zoom stays put until the gesture ends.
import { resizeCanvas, type Size } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect } from './editor-harness.ts'

async function openRecording() {
  const opened = await openEditor(doc([rect()]))
  const sizes: Size[] = []
  opened.editor.on('canvas', (size) => sizes.push(size))
  return { ...opened, sizes }
}

describe('canvas size event', () => {
  it('a resize step, its undo and redo each report the new size once', async () => {
    const { editor, sizes, changes } = await openRecording()

    await editor.update((d) => resizeCanvas(d, { width: 200, height: 100 }, 'center'), { cause: 'resize' })
    await editor.undo()
    await editor.redo()

    expect(sizes).toEqual([
      { width: 200, height: 100 },
      { width: 400, height: 300 },
      { width: 200, height: 100 },
    ])
    expect(changes.map((c) => c.cause)).toEqual(['resize', 'undo', 'redo'])
  })

  it('edits that keep the size, and a reload that keeps it, report nothing', async () => {
    const { editor, sizes } = await openRecording()

    await editor.update((d) => ({ ...d, name: 'other' }), { cause: 'inspector' })
    await editor.update((d) => ({ ...d, canvas: { ...d.canvas, background: null } }), { cause: 'reload' })
    await editor.undo()

    expect(sizes).toEqual([])
  })

  it('a reload from disk (e.g. after `doc resize`) and a new load report the size', async () => {
    const { editor, sizes } = await openRecording()

    await editor.update((d) => resizeCanvas(d, { width: 500, height: 300 }), { cause: 'reload' })
    await editor.load(doc([], { canvas: { width: 50, height: 60, background: null } }))

    expect(sizes).toEqual([
      { width: 500, height: 300 },
      { width: 50, height: 60 },
    ])
  })

  it('a preview reports nothing until it is committed; a cancelled one never', async () => {
    const { editor, sizes, changes } = await openRecording()

    const cancelled = editor.preview()
    await cancelled.show((d) => resizeCanvas(d, { width: 410, height: 300 }))
    await cancelled.cancel()
    const preview = editor.preview()
    await preview.show((d) => resizeCanvas(d, { width: 420, height: 300 }))
    await preview.show((d) => resizeCanvas(d, { width: 430, height: 300 }))
    expect(sizes).toEqual([])
    await preview.commit({ cause: 'resize' })

    expect(sizes).toEqual([{ width: 430, height: 300 }])
    expect(changes.map((c) => c.cause)).toEqual(['resize'])
  })
})
