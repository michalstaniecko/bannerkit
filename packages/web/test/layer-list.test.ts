// S2: Layer list and toolbar actions in the editor module (jsdom + node-canvas).
// Each action is applied with `apply(document, { cause: 'layers' })`: one undo step.
import type { Document, Layer } from '@bannerkit/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, type ChangeEvent, type Editor } from '../src/editor/index.ts'
import { addLayer, duplicateLayers, setLayerFlag } from '../src/layer-actions.ts'

const doc = (layers: Layer[]): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width: 400, height: 300, background: '#ffffff' },
  layers,
})

const rect = (id: string, x: number): Layer => ({ id, type: 'rect', x, y: 100, width: 100, height: 50, fill: '#ff0000' })

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
  const selections: string[][] = []
  editor.on('selection', ({ layerIds }) => selections.push(layerIds))
  const upper = container.querySelector<HTMLCanvasElement>('canvas.upper-canvas')!
  return { editor, upper, changes, selections }
}

const click = (target: EventTarget, [x, y]: [number, number]) => {
  for (const type of ['mousedown', 'mouseup']) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }))
  }
}

describe('Layer list actions', () => {
  it('adding a Layer is one undo step', async () => {
    const original = doc([rect('rect-1', 20)])
    const { editor, changes } = await open(original)

    await editor.apply(addLayer(editor.getDocument(), { type: 'rect' }).document, { cause: 'layers' })

    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([['layers', ['rect-2']]])
    await editor.undo()
    expect(editor.getDocument()).toEqual(original)
    expect(editor.canUndo()).toBe(false)
  })

  it('a locked Layer cannot be selected on the Canvas', async () => {
    const { editor, upper, selections } = await open(doc([rect('rect-1', 20)]))

    await editor.apply(setLayerFlag(editor.getDocument(), 'rect-1', 'locked', true), { cause: 'layers' })
    click(upper, [70, 125])

    expect(editor.getSelection()).toEqual([])
    expect(selections).toEqual([])
  })

  it('selects Layers by id, e.g. the copies of a duplicate, skipping unknown ones', async () => {
    const { editor, selections } = await open(doc([rect('rect-1', 20), rect('rect-2', 200)]))

    const { document, ids } = duplicateLayers(editor.getDocument(), ['rect-1', 'rect-2'])
    await editor.apply(document, { cause: 'layers' })
    editor.select(ids)
    expect(editor.getSelection()).toEqual(['rect-3', 'rect-4'])

    editor.select(['rect-9', 'rect-1'])
    expect(editor.getSelection()).toEqual(['rect-1'])

    editor.select([])
    expect(selections).toEqual([['rect-3', 'rect-4'], ['rect-1'], []])
  })
})
