// S2: `editor.update`, the Inspector's way to change the Document (jsdom + node-canvas).
// One call is one undo step and one `change`; the Selection stays and unchanged
// images are not loaded again.
import { describe, expect, it } from 'vitest'
import { doc, image, leaves, openEditor, rect } from './editor-harness.ts'

describe('update', () => {
  it('changes the Document as one undo step and one change with its cause', async () => {
    const original = doc([rect()])
    const { editor, changes } = await openEditor(original)

    await editor.update((d) => ({ ...d, layers: [{ ...d.layers[0]!, x: 120 }] }), { cause: 'inspector' })

    expect(leaves(editor.getDocument())[0]).toMatchObject({ x: 120, y: 100 })
    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([['inspector', ['rect-1']]])
    expect(changes[0]!.document).toEqual(editor.getDocument())
    await editor.undo()
    expect(editor.getDocument()).toEqual(original)
    expect(editor.canUndo()).toBe(false)
  })

  it('keeps the Selection, one Layer or several, without selection events', async () => {
    const { editor, selections } = await openEditor(doc([rect(), rect({ id: 'rect-2', x: 250 })]))
    editor.select(['rect-1'])
    await editor.update((d) => ({ ...d, layers: d.layers.map((l) => ({ ...l, y: 10 })) }), { cause: 'inspector' })
    expect(editor.getSelection()).toEqual(['rect-1'])

    editor.select(['rect-1', 'rect-2'])
    selections.length = 0
    await editor.update((d) => ({ ...d, layers: d.layers.map((l) => ({ ...l, y: 20 })) }), { cause: 'inspector' })

    expect(editor.getSelection()).toEqual(['rect-1', 'rect-2'])
    expect(selections).toEqual([])
    // Laid out in the scene, not relative to the selection that holds them.
    expect(leaves(editor.getDocument()).map((l) => [l.x, l.y])).toEqual([[100, 20], [250, 20]])
  })

  it('lays an image out again on the object it has, without loading it again', async () => {
    const { editor } = await openEditor(doc([image()]))
    const shown = editor.objectFor('image-1')

    await editor.update((d) => ({ ...d, layers: [{ ...d.layers[0]!, x: 30, opacity: 0.5 }] }), { cause: 'inspector' })

    expect(editor.objectFor('image-1')).toBe(shown)
    expect(shown).toMatchObject({ opacity: 0.5 })
    expect(leaves(editor.getDocument())[0]).toMatchObject({ x: 30, opacity: 0.5 })
  })

  it('shows a changed image src (or any new Layer) afresh, still keeping the Selection', async () => {
    const { editor } = await openEditor(doc([image(), rect()]))
    editor.select(['rect-1'])
    const shown = editor.objectFor('image-1')

    await editor.update((d) => ({ ...d, layers: [{ ...image(), src: 'assets/missing.png' }, ...d.layers.slice(1)] }), { cause: 'inspector' })

    expect(editor.objectFor('image-1')).not.toBe(shown)
    expect(editor.getSelection()).toEqual(['rect-1'])
  })

  it('records nothing when the recipe changes nothing', async () => {
    const { editor, changes } = await openEditor(doc([rect()]))

    await editor.update((d) => d, { cause: 'inspector' })

    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })

  it('sets the Canvas background in place', async () => {
    const { editor } = await openEditor(doc([rect()]))

    await editor.update((d) => ({ ...d, canvas: { ...d.canvas, background: null } }), { cause: 'inspector' })

    expect(editor.getDocument().canvas.background).toBeNull()
  })
})
