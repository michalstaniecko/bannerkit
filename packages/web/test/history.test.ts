// S2: undo/redo granularity in the editor module (jsdom + node-canvas). One logical
// action (a whole drag, a whole text edit, one `apply`) is exactly one step.
import type { Document, Layer, TextLayer } from '@bannerkit/core'
import { Textbox } from 'fabric'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, type ChangeEvent, type Editor } from '../src/editor/index.ts'

const doc = (layers: Layer[]): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width: 400, height: 300, background: '#ffffff' },
  layers,
})

const rect = (over: Partial<Extract<Layer, { type: 'rect' }>> = {}): Layer => ({
  id: 'rect-1',
  type: 'rect',
  x: 100,
  y: 100,
  width: 100,
  height: 50,
  fill: '#ff0000',
  ...over,
})

const text = (over: Partial<TextLayer> = {}): TextLayer => ({
  id: 'text-1',
  type: 'text',
  x: 50,
  y: 200,
  width: 200,
  text: 'Summer sale',
  fontFamily: 'Inter',
  fontWeight: 700,
  fontSize: 20,
  fill: '#111111',
  ...over,
})

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
  const upper = container.querySelector<HTMLCanvasElement>('canvas.upper-canvas')!
  return { editor, upper, changes }
}

type At = [number, number]
const mouse = (target: EventTarget, type: string, [x, y]: At, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }))

function drag(upper: HTMLCanvasElement, from: At, to: At) {
  mouse(upper, 'mousedown', from)
  for (const t of [0.25, 0.5, 0.75, 1]) {
    mouse(upper, 'mousemove', [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])
  }
  mouse(upper, 'mouseup', to)
}

describe('undo and redo', () => {
  it('a whole drag is one step: undo puts the Layer back, redo moves it again', async () => {
    const original = doc([rect()])
    const { editor, upper } = await open(original)
    drag(upper, [150, 125], [180, 145])
    const moved = editor.getDocument()

    expect(await editor.undo()).toBe(true)
    expect(editor.getDocument()).toEqual(original)

    expect(await editor.redo()).toBe(true)
    expect(editor.getDocument()).toEqual(moved)
    expect(moved.layers[0]).toMatchObject({ x: 130, y: 120 })
  })

  it('a whole text edit is one step, however many keystrokes it took', async () => {
    const original = doc([text()])
    const { editor } = await open(original)
    const box = editor.objectFor('text-1') as Textbox

    box.enterEditing()
    box.set({ text: 'Winter' })
    box.set({ text: 'Winter sale' })
    box.exitEditing()
    await editor.undo()

    expect(editor.getDocument()).toEqual(original)
    expect(editor.canUndo()).toBe(false)
  })

  it('ends a text edit in progress first, so undo steps back over that edit', async () => {
    const { editor } = await open(doc([rect(), text()]))
    const box = editor.objectFor('text-1') as Textbox
    box.canvas!.setActiveObject(box)
    box.enterEditing()
    box.set({ text: 'Winter sale' })

    await editor.undo()

    expect(editor.getDocument().layers[1]).toMatchObject({ text: 'Summer sale' })
    expect(editor.canRedo()).toBe(true)
  })

  it('emits a change for each undo and redo, so autosave follows them', async () => {
    const original = doc([rect(), rect({ id: 'rect-2', x: 250, y: 200 })])
    const { editor, upper, changes } = await open(original)
    drag(upper, [150, 125], [180, 145])

    await editor.undo()
    await editor.redo()

    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([
      ['transform', ['rect-1']],
      ['undo', ['rect-1']],
      ['redo', ['rect-1']],
    ])
    expect(changes[1]!.document).toEqual(original)
  })

  it('does nothing past either end of the history', async () => {
    const { editor, changes } = await open(doc([rect()]))

    expect([editor.canUndo(), editor.canRedo()]).toEqual([false, false])
    expect([await editor.undo(), await editor.redo()]).toEqual([false, false])
    expect(changes).toEqual([])
  })

  it('a new edit after an undo drops the undone steps', async () => {
    const { editor, upper } = await open(doc([rect()]))
    drag(upper, [150, 125], [180, 145])
    await editor.undo()

    drag(upper, [150, 125], [150, 175])

    expect(editor.canRedo()).toBe(false)
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 150 })
    await editor.undo()
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 100 })
    expect(editor.canUndo()).toBe(false)
  })

  it('keeps the latest 100 snapshots', async () => {
    const original = doc([rect()])
    const { editor } = await open(original)
    for (let i = 1; i <= 120; i++) await editor.apply(doc([rect({ x: i })]), { cause: 'json' })

    let undone = 0
    while (await editor.undo()) undone++

    expect(undone).toBe(99)
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 21 })
  })

  it('starts a fresh history on load', async () => {
    const { editor, upper } = await open(doc([rect()]))
    drag(upper, [150, 125], [180, 145])

    await editor.load(doc([rect({ id: 'other' })]))

    expect(editor.canUndo()).toBe(false)
  })
})

describe('apply', () => {
  it('shows a Document as one step, with its cause, that undo takes back', async () => {
    const original = doc([rect()])
    const { editor, changes } = await open(original)
    const next = doc([rect({ fill: '#00ff00' }), text()])

    await editor.apply(next, { cause: 'json' })

    expect(editor.getDocument()).toEqual(next)
    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([['json', ['rect-1', 'text-1']]])
    await editor.undo()
    expect(editor.getDocument()).toEqual(original)
    expect(changes.at(-1)).toMatchObject({ cause: 'undo', layerIds: ['rect-1', 'text-1'] })
  })

  it('records no step when the Document is unchanged', async () => {
    const original = doc([rect()])
    const { editor, changes } = await open(original)

    await editor.apply(structuredClone(original), { cause: 'reload' })

    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })
})

describe('keyboard shortcuts', () => {
  const key = (key: string, init: KeyboardEventInit = {}) =>
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

  it('Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo', async () => {
    const { editor, upper, changes } = await open(doc([rect()]))
    drag(upper, [150, 125], [180, 145])
    drag(upper, [180, 145], [200, 145])

    key('z', { metaKey: true })
    await settle()
    key('z', { ctrlKey: true })
    await settle()
    key('Z', { metaKey: true, shiftKey: true })
    await settle()
    key('y', { ctrlKey: true })
    await settle()

    expect(changes.map((c) => c.cause)).toEqual(['transform', 'transform', 'undo', 'undo', 'redo', 'redo'])
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 150, y: 120 })
  })

  it('leave typing in a field alone', async () => {
    const { upper, changes } = await open(doc([rect()]))
    drag(upper, [150, 125], [180, 145])
    const field = document.createElement('input')
    document.body.append(field)

    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    await settle()

    expect(changes).toHaveLength(1)
  })
})
