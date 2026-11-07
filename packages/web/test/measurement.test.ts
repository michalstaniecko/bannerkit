// Measurement with Alt, in the editor (jsdom + node-canvas): real mouse and key events,
// asserted through `marks()` and the Document.
import { describe, expect, it } from 'vitest'
import { doc, gesture, key, leaves, mouse, openEditor, rect } from './editor-harness.ts'

const box = (id: string, x: number, y: number, width = 40, height = 40, over = {}) => rect({ id, x, y, width, height, ...over })

/** Releases a key on the page. */
const keyUp = (name: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent('keyup', { key: name, bubbles: true, cancelable: true, ...init }))

const alt = () => key('Alt', { altKey: true })

// The 400×300 Canvas: `a` 0..40 × 0..40 (selected), `b` 100..140 × 60..100.
const scene = (over = {}) => doc([box('a', 0, 0), box('b', 100, 60, 40, 40, over)])

const toB = [
  { kind: 'measure-box', rect: { x: 100, y: 60, width: 40, height: 40 } },
  { kind: 'measure', axis: 'x', at: 20, from: 40, to: 100, label: '60', extension: { at: 100, from: 20, to: 60 } },
  { kind: 'measure', axis: 'y', at: 20, from: 40, to: 60, label: '20', extension: { at: 60, from: 20, to: 100 } },
]

const toCanvas = [
  { kind: 'measure-box', rect: { x: 0, y: 0, width: 400, height: 300 } },
  { kind: 'measure', axis: 'x', at: 20, from: 40, to: 400, label: '360' },
  { kind: 'measure', axis: 'y', at: 20, from: 40, to: 300, label: '260' },
]

describe('Measurement with Alt', () => {
  it('measures from the Selection Box to the Layer under the pointer, as soon as Alt is pressed', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['a'])
    mouse(upper, 'mousemove', [120, 80])
    expect(editor.marks()).toEqual([])

    alt()
    expect(editor.marks()).toEqual(toB)
  })

  it('follows the pointer while Alt is held', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['a'])
    mouse(upper, 'mousemove', [300, 250])
    alt()
    expect(editor.marks()).toEqual(toCanvas)
    mouse(upper, 'mousemove', [120, 80], { altKey: true })
    expect(editor.marks()).toEqual(toB)
  })

  it('measures to the Canvas edges over the empty Canvas', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['a'])
    mouse(upper, 'mousemove', [300, 250])
    alt()
    expect(editor.marks()).toEqual(toCanvas)
  })

  it('measures to the Canvas edges over a locked or a hidden Layer', async () => {
    for (const over of [{ locked: true }, { visible: false }]) {
      const { editor, upper } = await openEditor(scene(over))
      editor.select(['a'])
      mouse(upper, 'mousemove', [120, 80])
      alt()
      expect(editor.marks()).toEqual(toCanvas)
      keyUp('Alt')
    }
  })

  it('measures to the Canvas edges over a selected Layer', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['a', 'b'])
    mouse(upper, 'mousemove', [120, 80])
    alt()
    // the Selection Box 0..140 × 0..100
    expect(editor.marks()).toEqual([
      { kind: 'measure-box', rect: { x: 0, y: 0, width: 400, height: 300 } },
      { kind: 'measure', axis: 'x', at: 50, from: 140, to: 400, label: '260' },
      { kind: 'measure', axis: 'y', at: 70, from: 100, to: 300, label: '200' },
    ])
  })

  it('measures to the Layer a click would select: the Group, not its child', async () => {
    const { editor, upper } = await openEditor(
      doc([box('a', 0, 0), { id: 'g', type: 'group', layers: [box('b', 100, 60), box('c', 200, 60)] }]),
    )
    editor.select(['a'])
    mouse(upper, 'mousemove', [120, 80])
    alt()
    expect(editor.marks()[0]).toEqual({ kind: 'measure-box', rect: { x: 100, y: 60, width: 140, height: 40 } })
  })

  it('shows nothing without a Selection', async () => {
    const { editor, upper } = await openEditor(scene())
    mouse(upper, 'mousemove', [120, 80])
    alt()
    expect(editor.marks()).toEqual([])
  })

  it('shows nothing before the pointer has been over the Canvas, or once it left', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['a'])
    alt()
    expect(editor.marks()).toEqual([])
    mouse(upper, 'mousemove', [120, 80], { altKey: true })
    expect(editor.marks()).toEqual(toB)
    mouse(upper, 'mouseout', [500, 80], { altKey: true })
    expect(editor.marks()).toEqual([])
  })

  it('prevents the default of the Alt keydown', async () => {
    await openEditor(scene())
    const event = new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('goes when Alt is released', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['a'])
    mouse(upper, 'mousemove', [120, 80])
    alt()
    keyUp('Alt')
    expect(editor.marks()).toEqual([])
  })

  it('goes when the window loses focus', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['a'])
    mouse(upper, 'mousemove', [120, 80])
    alt()
    window.dispatchEvent(new Event('blur'))
    expect(editor.marks()).toEqual([])
  })

  it('goes when the Selection empties', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.select(['a'])
    mouse(upper, 'mousemove', [120, 80])
    alt()
    editor.select([])
    expect(editor.marks()).toEqual([])
  })

  it('goes when a gesture starts', async () => {
    const { editor, upper } = await openEditor(scene())
    editor.setSnapping(false)
    editor.select(['a'])
    mouse(upper, 'mousemove', [20, 20])
    alt()
    expect(editor.marks()).not.toEqual([])
    const g = gesture(upper, [20, 20], { altKey: true })
    expect(editor.marks()).toEqual([])
    g.move([30, 30])
    expect(editor.marks()).toEqual([])
    g.release()
  })

  it('draws on the top canvas in the --measure colour', async () => {
    const container = document.createElement('div')
    container.style.setProperty('--measure', '#00ff00')
    const { editor, upper } = await openEditor(scene(), { container })
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const pixel = (x: number, y: number) => [...upper.getContext('2d')!.getImageData(x, y, 1, 1).data]
    editor.select(['a'])
    mouse(upper, 'mousemove', [120, 80])
    alt()
    await frame()
    // the x distance runs along y = 20 from x 40 to 100; b's outline x = 100..140 at y = 60
    expect(pixel(44, 20)).toEqual([0, 255, 0, 255])
    expect(pixel(120, 60)).toEqual([0, 255, 0, 255])
    keyUp('Alt')
    await frame()
    expect(pixel(44, 20)).toEqual([0, 0, 0, 0])
  })
})

describe('Alt while resizing', () => {
  it('still resizes from the centre', async () => {
    const { editor, upper } = await openEditor(doc([box('a', 100, 100, 100, 50)]))
    editor.setSnapping(false)
    editor.select(['a'])
    mouse(upper, 'mousemove', [200, 125])
    alt()
    // the right middle handle, dragged 20 px right with Alt: both sides grow by 20
    const g = gesture(upper, [200, 125], { altKey: true })
    g.move([210, 125])
    g.move([220, 125])
    g.release()
    expect(leaves(editor.getDocument())[0]).toMatchObject({ x: 80, width: 140, y: 100, height: 50 })
  })
})
