// Guides (Document v2) in the editor: every editor step keeps them (they live on the
// Document, not on a Fabric object), `dragGuide` creates, moves and removes them as one
// `guides` step, and a Guide on the Canvas is hit and dragged with real mouse events.
import { resizeCanvas, validateDocument, type Document } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, mouse, openEditor, rect, text } from './editor-harness.ts'
import { settle } from './inspector-harness.tsx'

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

describe('a step or preview changing only Guides', () => {
  it('does not lay the Layers out again (no text is measured)', async () => {
    let measured = 0
    const measure = (font: { size: number }, text: string) => {
      measured++
      return text.length * font.size * 0.5
    }
    const { editor } = await openEditor(doc([text(), rect()], { guides }), { measure })
    measured = 0

    const preview = editor.preview()
    await preview.show((d) => ({ ...d, guides: { x: [0, 210], y: [150] } }))
    expect(editor.getDocument().guides).toEqual({ x: [0, 210], y: [150] })
    await preview.commit({ cause: 'guides' })
    await editor.undo()
    await editor.redo()
    await editor.update((d) => ({ ...d, guides: { x: [5], y: [] } }), { cause: 'guides' })

    expect(editor.getDocument().guides).toEqual({ x: [5], y: [] })
    expect(measured).toBe(0)
  })
})

/** A pointer at client (x, y); at zoom 1 in jsdom also the Canvas point. */
const at = (clientX: number, clientY: number, init: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({ clientX, clientY, ...init })

/** An element standing for a Ruler: releasing a Guide inside `rect` (client px) removes it. */
function fakeRuler(left: number, top: number, width: number, height: number): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) })
  document.body.append(element)
  return element
}

describe('dragGuide', () => {
  it('creates a Guide at the end of its axis, on whole px, as one guides step', async () => {
    const { editor, changes } = await openEditor(doc([], { guides }))
    const drag = editor.dragGuide('y', 'new')
    await drag.move(at(10, 40.4))
    await drag.move(at(10, 80.4))
    expect(editor.getDocument().guides).toEqual({ x: [0, 200], y: [150, 80] })
    expect(changes).toEqual([])
    await drag.end(at(10, 70.6))

    expect(changes.map((c) => [c.cause, c.document.guides])).toEqual([['guides', { x: [0, 200], y: [150, 71] }]])
  })

  it('creates the guides key, before layers, when the Document has none', async () => {
    const { editor, changes } = await openEditor(doc([rect()]))
    const drag = editor.dragGuide('x', 'new')
    await drag.move(at(30, 10))
    await drag.end(at(30, 10))

    expect(changes[0]!.document.guides).toEqual({ x: [30], y: [] })
    expect(Object.keys(changes[0]!.document)).toEqual(['version', 'name', 'canvas', 'guides', 'layers'])
  })

  it('moves a Guide: the new value replaces it at the same index, duplicates allowed', async () => {
    const { editor, changes } = await openEditor(doc([], { guides }))
    const drag = editor.dragGuide('x', 0)
    await drag.move(at(120, 10))
    await drag.end(at(200, 10))

    expect(changes.map((c) => c.document.guides)).toEqual([{ x: [200, 200], y: [150] }])
  })

  it('a click without a move changes nothing', async () => {
    const { editor, changes } = await openEditor(doc([], { guides }))
    await editor.dragGuide('y', 'new').end(at(10, 40))
    await editor.dragGuide('x', 1).end(at(260, 40))

    expect(changes).toEqual([])
    expect(editor.getDocument().guides).toEqual(guides)
  })

  it('released over a Ruler: removes a Guide, or does not create it', async () => {
    const { editor, changes } = await openEditor(doc([], { guides }))
    editor.addRuler(fakeRuler(0, -20, 400, 20))

    const created = editor.dragGuide('y', 'new')
    await created.move(at(50, 30))
    await created.end(at(50, -10))
    expect(changes).toEqual([])

    const moved = editor.dragGuide('x', 1)
    await moved.move(at(210, 30))
    await moved.move(at(210, -5))
    expect(editor.getDocument().guides).toEqual({ x: [0], y: [150] })
    await moved.end(at(210, -5))
    expect(changes.map((c) => [c.cause, c.document.guides])).toEqual([['guides', { x: [0], y: [150] }]])
  })

  it('removing the last Guide removes the guides key', async () => {
    const { editor, changes } = await openEditor(doc([], { guides: { x: [], y: [40] } }))
    editor.addRuler(fakeRuler(-20, 0, 20, 300))
    const drag = editor.dragGuide('y', 0)
    await drag.move(at(-10, 40))
    await drag.end(at(-10, 40))

    expect(changes[0]!.document).not.toHaveProperty('guides')
  })

  it('Escape cancels: the Document from before the gesture shows again, no step', async () => {
    const { editor, changes } = await openEditor(doc([], { guides }))
    const drag = editor.dragGuide('x', 1)
    await drag.move(at(300, 10))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()
    await drag.move(at(320, 10))
    await drag.end(at(320, 10))

    expect(editor.getDocument().guides).toEqual(guides)
    expect(changes).toEqual([])
  })

  it('a reload from disk ends the gesture', async () => {
    const { editor, changes } = await openEditor(doc([], { guides }))
    const drag = editor.dragGuide('x', 1)
    await drag.move(at(300, 10))
    await editor.apply({ ...editor.getDocument(), guides: { x: [7], y: [] } }, { cause: 'reload' })
    await drag.end(at(310, 10))

    expect(editor.getDocument().guides).toEqual({ x: [7], y: [] })
    expect(changes.map((c) => c.cause)).toEqual(['reload'])
  })

  it('creating, moving and removing are one undo step each', async () => {
    const { editor } = await openEditor(doc([]))
    editor.addRuler(fakeRuler(0, -20, 400, 20))
    const drag = async (axis: 'x' | 'y', index: number | 'new', to: [number, number]) => {
      const d = editor.dragGuide(axis, index)
      await d.move(at(...to))
      await d.end(at(...to))
    }
    await drag('x', 'new', [50, 50])
    await drag('x', 0, [70, 50])
    await drag('x', 0, [70, -10])
    expect(editor.getDocument()).not.toHaveProperty('guides')

    await editor.undo()
    expect(editor.getDocument().guides).toEqual({ x: [70], y: [] })
    await editor.undo()
    expect(editor.getDocument().guides).toEqual({ x: [50], y: [] })
    await editor.undo()
    expect(editor.getDocument()).not.toHaveProperty('guides')
    await editor.redo()
    expect(editor.getDocument().guides).toEqual({ x: [50], y: [] })
  })

  it('the first Guide in a v1 Document saves it as v2', async () => {
    const v1 = { version: 1, name: 'old', canvas: { width: 400, height: 300, background: '#ffffff' }, layers: [] }
    const read = validateDocument(v1)
    if (!read.ok) throw new Error('invalid fixture')
    const { editor, changes } = await openEditor(read.document)
    const drag = editor.dragGuide('x', 'new')
    await drag.move(at(30, 10))
    await drag.end(at(30, 10))

    const saved: Document = changes[0]!.document
    expect(saved).toMatchObject({ version: 2, guides: { x: [30], y: [] } })
    expect(validateDocument(JSON.parse(JSON.stringify(saved))).ok).toBe(true)
  })

  it('snaps to Layers and the Canvas, not with Cmd/Ctrl, not after setSnapping(false)', async () => {
    const { editor } = await openEditor(doc([rect()]))
    const value = async (point: ReturnType<typeof at>) => {
      const d = editor.dragGuide('x', 'new')
      await d.move(point)
      const shown = editor.getDocument().guides!.x[0]
      await d.cancel()
      return shown
    }
    expect(await value(at(203, 10))).toBe(200)
    expect(editor.marks()).toEqual([])
    expect(await value(at(203, 10, { metaKey: true }))).toBe(203)
    expect(await value(at(203, 10, { ctrlKey: true }))).toBe(203)
    expect(await value(at(147, 10))).toBe(150)
    editor.setSnapping(false)
    expect(await value(at(203, 10))).toBe(203)
  })

  it('shows the snap line in marks() while it snaps', async () => {
    const { editor } = await openEditor(doc([rect()]))
    const d = editor.dragGuide('x', 'new')
    await d.move(at(203, 10))
    // the rect's right edge is also the Canvas centre
    expect(editor.marks()).toEqual([
      { kind: 'snap-line', axis: 'x', at: 200, from: 0, to: 300, source: 'canvas' },
      { kind: 'snap-line', axis: 'x', at: 200, from: 100, to: 150, source: 'layer' },
    ])
    await d.end(at(203, 10))
    expect(editor.marks()).toEqual([])
  })

  it('reads the pointer relative to the Canvas at the zoom', async () => {
    const { editor } = await openEditor(doc([]))
    editor.setZoom(2)
    const d = editor.dragGuide('y', 'new')
    await d.move(at(10, 101))
    await d.end(at(10, 101))
    expect(editor.getDocument().guides).toEqual({ x: [], y: [51] })
  })
})

describe('Guides on the Canvas', () => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
  const pixel = (upper: HTMLCanvasElement, x: number, y: number) => [...upper.getContext('2d')!.getImageData(x, y, 1, 1).data]

  /** Presses at `from` on the Canvas, moves the pointer over the page to `to`, releases there; lets the editor settle. */
  async function dragOnCanvas(upper: HTMLCanvasElement, from: [number, number], to: [number, number], init: MouseEventInit = {}) {
    mouse(upper, 'mousedown', from, init)
    mouse(document, 'mousemove', [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], init)
    await settle()
    mouse(document, 'mousemove', to, init)
    await settle()
    mouse(document, 'mouseup', to, init)
    await settle()
  }

  it('draws each Guide across the Canvas, 1 screen px, in the --guide colour', async () => {
    const container = document.createElement('div')
    container.style.setProperty('--guide', '#00ff00')
    const { upper, editor } = await openEditor(doc([], { guides: { x: [250], y: [40] } }), { container })
    editor.setZoom(2)
    await frame()
    expect(pixel(upper, 500, 10)).toEqual([0, 255, 0, 255])
    expect(pixel(upper, 799, 80)).toEqual([0, 255, 0, 255])
    expect(pixel(upper, 502, 10)).toEqual([0, 0, 0, 0])
    expect(editor.marks()).toEqual([])
  })

  it('a Guide from the JSON is hit within 3 screen px: the cursor shows it, and it lights up', async () => {
    const container = document.createElement('div')
    container.style.setProperty('--guide', '#00ff00')
    container.style.setProperty('--guide-active', '#0000ff')
    const { upper } = await openEditor(doc([rect()], { guides: { x: [250], y: [40] } }), { container })

    mouse(upper, 'mousemove', [253, 200])
    await frame()
    expect(upper.style.cursor).toBe('ew-resize')
    expect(pixel(upper, 250, 200)).toEqual([0, 0, 255, 255])
    mouse(upper, 'mousemove', [300, 42])
    expect(upper.style.cursor).toBe('ns-resize')
    mouse(upper, 'mousemove', [300, 100])
    await frame()
    expect(upper.style.cursor).not.toMatch(/resize/)
    expect(pixel(upper, 250, 200)).toEqual([0, 255, 0, 255])
  })

  it('dragging a Guide moves it: the new value at the same index, one guides step', async () => {
    const { editor, upper, changes } = await openEditor(doc([rect({ x: 10, y: 10, width: 20, height: 20 })], { guides: { x: [0, 250, 300], y: [40] } }))

    await dragOnCanvas(upper, [251, 200], [322, 200])

    expect(changes.map((c) => [c.cause, c.document.guides])).toEqual([['guides', { x: [0, 322, 300], y: [40] }]])
    expect(editor.getSelection()).toEqual([])
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 10, y: 10 })
  })

  it('a Guide over a Layer wins over the Layer', async () => {
    const { editor, upper, changes } = await openEditor(doc([rect()], { guides: { x: [], y: [120] } }))
    editor.setSnapping(false)

    await dragOnCanvas(upper, [150, 121], [150, 180])

    expect(editor.getDocument().guides).toEqual({ x: [], y: [180] })
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 100 })
    expect(changes.map((c) => c.cause)).toEqual(['guides'])
  })

  it("the selected Layer's handles win over a Guide under them", async () => {
    // the rect's right edge (handle at 200, 125) lies on the Guide x = 200
    const { editor, upper, changes } = await openEditor(doc([rect()], { guides: { x: [200], y: [] } }))
    editor.setSnapping(false)
    editor.select(['rect-1'])

    mouse(upper, 'mousemove', [200, 125])
    expect(upper.style.cursor).not.toBe('ew-resize')
    await dragOnCanvas(upper, [200, 125], [240, 125])

    expect(editor.getDocument().guides).toEqual({ x: [200], y: [] })
    expect(editor.getDocument().layers[0]).toMatchObject({ width: 140 })
    expect(changes.map((c) => c.cause)).toEqual(['transform'])
  })

  it('snaps while dragged, but not with Cmd held', async () => {
    const { editor, upper } = await openEditor(doc([rect()], { guides: { x: [300], y: [] } }))
    await dragOnCanvas(upper, [300, 20], [203, 20])
    expect(editor.getDocument().guides).toEqual({ x: [200], y: [] })
    await dragOnCanvas(upper, [200, 20], [97, 20], { metaKey: true })
    expect(editor.getDocument().guides).toEqual({ x: [97], y: [] })
  })

  it('Escape in the middle of a drag shows the Guide where it was, without a step', async () => {
    const { editor, upper, changes } = await openEditor(doc([], { guides: { x: [250], y: [] } }))
    mouse(upper, 'mousedown', [250, 20])
    mouse(document, 'mousemove', [320, 20])
    await settle()
    expect(editor.getDocument().guides).toEqual({ x: [320], y: [] })
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()
    mouse(document, 'mousemove', [330, 20])
    mouse(document, 'mouseup', [330, 20])
    await settle()

    expect(editor.getDocument().guides).toEqual({ x: [250], y: [] })
    expect(changes).toEqual([])
  })
})
