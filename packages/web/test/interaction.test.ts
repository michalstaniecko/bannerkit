// S2: direct manipulation in the editor module (jsdom + node-canvas). Interactions
// are driven through real mouse and keyboard events on the canvas, so Fabric runs
// its own transform code; the Document is read back through `getDocument` and the
// `change` / `selection` events.
import type { Document, ImageLayer, Layer, TextLayer } from '@bannerkit/core'
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

let editor: Editor | undefined
afterEach(async () => {
  await editor?.destroy()
  editor = undefined
  document.body.innerHTML = ''
})

/** A 40×20 PNG: left half red, right half blue. */
function twoToneImage(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 40
  canvas.height = 20
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 20, 20)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(20, 0, 20, 20)
  return canvas.toDataURL('image/png')
}

async function open(document_: Document) {
  const container = document.createElement('div')
  document.body.append(container)
  editor = createEditor({ loadFonts: async () => {} })
  editor.mount(container)
  await editor.load(document_, { assetUrl: (src) => (src === 'assets/two-tone.png' ? twoToneImage() : 'data:image/png;base64,bm90IGFuIGltYWdl') })
  const changes: ChangeEvent[] = []
  const selections: string[][] = []
  editor.on('change', (event) => changes.push(event))
  editor.on('selection', ({ layerIds }) => selections.push(layerIds))
  const upper = container.querySelector<HTMLCanvasElement>('canvas.upper-canvas')!
  return { editor, container, upper, changes, selections }
}

type At = [number, number]
const mouse = (target: EventTarget, type: string, [x, y]: At, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }))

/** A press at `from`, moves in a few steps, and a release at `to`. */
function drag(upper: HTMLCanvasElement, from: At, to: At, init: MouseEventInit = {}) {
  mouse(upper, 'mousedown', from, init)
  for (const t of [0.25, 0.5, 0.75, 1]) {
    mouse(upper, 'mousemove', [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], init)
  }
  mouse(upper, 'mouseup', to, init)
}

const click = (upper: HTMLCanvasElement, at: At, init: MouseEventInit = {}) => {
  mouse(upper, 'mousedown', at, init)
  mouse(upper, 'mouseup', at, init)
}

const key = (key: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

describe('moving', () => {
  it('dragging a Layer moves its Box and emits one change with the new Document', async () => {
    const { editor, upper, changes } = await open(doc([rect()]))

    drag(upper, [150, 125], [180, 145])

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 130, y: 120, width: 100, height: 50 })
    expect(changes).toHaveLength(1)
    expect(changes[0]!.document).toEqual(editor.getDocument())
  })
})

describe('resizing and rotating', () => {
  it('bakes a side-handle scale into width and resets the object scale to 1', async () => {
    const { editor, upper, changes } = await open(doc([rect()]))
    click(upper, [150, 125])

    drag(upper, [200, 125], [250, 125]) // the right handle

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 100, width: 150, height: 50 })
    const object = editor.objectFor('rect-1')!
    expect([object.scaleX, object.scaleY, object.width, object.height]).toEqual([1, 1, 150, 50])
    expect(changes.map((c) => c.cause)).toEqual(['transform'])
  })

  it('keeps the unrotated top-left of a rotated Layer when its bottom handle is dragged', async () => {
    const { editor, upper } = await open(doc([rect({ rotation: 90 })]))
    // centre (150, 125); rotated 90° the Box's bottom edge is on the left, at x = 125
    click(upper, [150, 125])

    drag(upper, [125, 125], [75, 125])

    // height 50 → 100, growing away from the top edge (x = 175): centre (125, 125)
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 75, y: 75, width: 100, height: 100, rotation: 90 })
    expect(editor.objectFor('rect-1')!.scaleY).toBe(1)
  })

  it('rotates with the rotation handle and writes the angle back', async () => {
    const { editor, upper } = await open(doc([rect()]))
    click(upper, [150, 125])
    const handle = editor.objectFor('rect-1')!.oCoords.mtr!

    drag(upper, [handle.x, handle.y], [150 + 200, 125]) // pointer due right of the centre

    const layer = editor.getDocument().layers[0]!
    expect(layer.rotation).toBeCloseTo(90, 5)
    expect(layer).toMatchObject({ width: 100, height: 50 })
    expect(layer.x).toBeCloseTo(100, 6)
    expect(layer.y).toBeCloseTo(100, 6)
  })
})

describe('whole-pixel transforms', () => {
  it('a drag, resize or multi-select move writes whole-pixel x/y/width/height', async () => {
    const { editor, upper } = await open(two())
    drag(upper, [150, 125], [180.4, 145.6])
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 130, y: 121, width: 100, height: 50 })

    drag(upper, [230, 146], [262.7, 146]) // the right handle (Box now at x 130..230)
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 130, y: 121, width: 133, height: 50 })

    drag(upper, [5, 5], [395, 295]) // rubber-band both
    drag(upper, [190, 146], [193.3, 148.8])
    const [a, b] = editor.getDocument().layers
    expect(a).toMatchObject({ x: 133, y: 124, width: 133, height: 50 })
    expect([b!.x, b!.y, b!.width, b!.height, b!.rotation]).toEqual([253, 203, 100, 50, 30])
  })

  it('a rotation writes the angle rounded to 0.1°', async () => {
    const { editor, upper } = await open(doc([rect()]))
    click(upper, [150, 125])
    const handle = editor.objectFor('rect-1')!.oCoords.mtr!

    drag(upper, [handle.x, handle.y], [150 + 200, 125 + 37]) // ≈ 100.48°

    const layer = editor.getDocument().layers[0]!
    expect(layer.rotation).toBe(100.5)
    expect([layer.x, layer.y, layer.width, layer.height]).toEqual([100, 100, 100, 50])
  })
})

const text = (over: Partial<TextLayer> = {}): TextLayer => ({
  id: 'text-1',
  type: 'text',
  x: 50,
  y: 50,
  width: 200,
  text: 'Summer sale',
  fontFamily: 'Inter',
  fontWeight: 700,
  fontSize: 20,
  fill: '#111111',
  ...over,
})

describe('text Layers', () => {
  it('have side, bottom and rotation handles only', async () => {
    const { editor } = await open(doc([text()]))

    expect(Object.keys(editor.objectFor('text-1')!.controls).sort()).toEqual(['mb', 'ml', 'mr', 'mtr'])
  })

  it('change only width from a side handle, never stretching glyphs', async () => {
    const { editor, upper } = await open(doc([text()]))
    click(upper, [60, 60])
    const object = editor.objectFor('text-1')!
    const right = object.oCoords.mr!
    const left = object.oCoords.ml!

    mouse(upper, 'mousedown', [right.x, right.y])
    mouse(upper, 'mousemove', [right.x + 50, right.y])
    expect([object.scaleX, object.scaleY]).toEqual([1, 1]) // mid-drag, too
    mouse(upper, 'mouseup', [right.x + 50, right.y])
    drag(upper, [left.x, left.y], [left.x - 20, left.y])

    const layer = editor.getDocument().layers[0]
    expect(layer).toMatchObject({ x: 30, y: 50, width: 270, fontSize: 20 })
    expect(layer).not.toHaveProperty('height')
    expect([object.scaleX, object.scaleY, (object as Textbox).fontSize]).toEqual([1, 1, 20])
  })

  it('change only height from the bottom handle', async () => {
    const { editor, upper } = await open(doc([text({ height: 40 })]))
    click(upper, [60, 60])
    const bottom = editor.objectFor('text-1')!.oCoords.mb!

    drag(upper, [bottom.x, bottom.y], [bottom.x + 30, 150])

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 50, y: 50, width: 200, height: 100, fontSize: 20 })
    expect(editor.objectFor('text-1')!.scaleY).toBe(1)
  })

  it('write edited text back when editing exits, as one change', async () => {
    const { editor, changes } = await open(doc([text()]))
    const box = editor.objectFor('text-1') as Textbox

    box.enterEditing()
    box.set({ text: 'Winter sale' })
    box.exitEditing()

    expect(editor.getDocument().layers[0]).toMatchObject({ text: 'Winter sale' })
    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([['text', ['text-1']]])
  })

  it('emit nothing when editing exits with the text unchanged', async () => {
    const { editor, changes } = await open(doc([text()]))
    const box = editor.objectFor('text-1') as Textbox

    box.enterEditing()
    box.exitEditing()

    expect(changes).toEqual([])
  })

  it('show the transformed text, and the typed text while editing (textTransform)', async () => {
    const { editor, changes } = await open(doc([text({ text: 'Straße sale', textTransform: 'uppercase' })]))
    const box = editor.objectFor('text-1') as Textbox
    expect(box.text).toBe('STRASSE SALE')

    box.enterEditing()
    expect(box.text).toBe('Straße sale')
    expect(box.hiddenTextarea!.value).toBe('Straße sale')
    box.exitEditing()

    expect(box.text).toBe('STRASSE SALE')
    expect(changes).toEqual([])
  })

  it('save the typed text, not the transformed one, when editing exits', async () => {
    const { editor, changes } = await open(doc([text({ text: 'Spring sale', textTransform: 'uppercase' })]))
    const box = editor.objectFor('text-1') as Textbox

    box.enterEditing()
    box.set({ text: 'Winter sale' })
    box.exitEditing()

    expect(editor.getDocument().layers[0]).toMatchObject({ text: 'Winter sale', textTransform: 'uppercase' })
    expect(box.text).toBe('WINTER SALE')
    expect(changes.map((c) => c.cause)).toEqual(['text'])
  })
})

const image = (over: Partial<ImageLayer> = {}): ImageLayer => ({
  id: 'image-1',
  type: 'image',
  x: 20,
  y: 20,
  width: 40,
  height: 40,
  src: 'assets/two-tone.png',
  fit: 'cover',
  ...over,
})

describe('baking a modification', () => {
  it('is lossless: Document → Fabric → Document for every Layer type, Fit and rotation', async () => {
    const original = doc([
      rect({ x: 12.5, y: 7.25, rotation: -37.5, cornerRadius: 6, opacity: 0.8 }),
      image({ fit: 'cover', rotation: 30 }),
      image({ id: 'image-2', fit: 'contain', x: 103.5, y: 160, width: 17, height: 90, rotation: -12.5 }),
      image({ id: 'image-3', fit: 'stretch', x: 300, y: 10, width: 13, height: 7 }),
      image({ id: 'image-4', src: 'assets/missing.png', x: 300, y: 200, rotation: 15 }),
      text({ x: 150, y: 20, height: 60, rotation: 12, align: 'center', verticalAlign: 'middle' }),
      text({ id: 'text-2', x: 150, y: 240, width: 120 }),
    ])
    const { editor, upper, changes } = await open(original)
    drag(upper, [1, 1], [399, 299]) // rubber-band everything

    key('ArrowRight')
    key('ArrowLeft')

    expect(changes).toHaveLength(2)
    expect(changes[1]!.layerIds).toHaveLength(7)
    expect(editor.getDocument()).toEqual(original)
  })

  it('re-applies an image Fit at the resized Box instead of keeping the stretch', async () => {
    const { editor, upper } = await open(doc([image({ x: 100, y: 100, width: 40, height: 40 })]))
    click(upper, [120, 120])
    const object = editor.objectFor('image-1')!
    const coverScale = object.scaleX // 2: a 40×20 image covering 40×40

    drag(upper, [140, 120], [180, 120]) // the right handle: 40 → 80 wide

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 100, width: 80, height: 40 })
    // cover of 80×40 is the image ×2 in both directions, cropped to nothing
    expect([coverScale, object.scaleX, object.scaleY]).toEqual([2, 2, 2])
  })
})

const two = () => doc([rect(), rect({ id: 'rect-2', x: 250, y: 200, rotation: 30 })])

describe('multi-select', () => {
  it('reports the selection as Layer ids, bottom → top', async () => {
    const { editor, upper, selections } = await open(two())

    click(upper, [150, 125])
    click(upper, [300, 225], { shiftKey: true })
    click(upper, [20, 280])

    expect(selections).toEqual([['rect-1'], ['rect-1', 'rect-2'], []])
    expect(editor.getSelection()).toEqual([])
  })

  it('moves the selected Layers together, as one change', async () => {
    const { editor, upper, changes } = await open(two())
    drag(upper, [20, 20], [390, 290]) // rubber-band both

    drag(upper, [150, 125], [160, 145])

    const [a, b] = editor.getDocument().layers
    expect(a).toMatchObject({ x: 110, y: 120, width: 100, height: 50 })
    expect(b!.x).toBeCloseTo(260, 6)
    expect(b!.y).toBeCloseTo(220, 6)
    expect(b!.rotation).toBeCloseTo(30, 6)
    expect(changes.map((c) => c.layerIds)).toEqual([['rect-1', 'rect-2']])
    expect(editor.getSelection()).toEqual(['rect-1', 'rect-2'])
  })
})

describe('nudging', () => {
  it('moves the selection 1px per arrow key, 10px with Shift, one change each', async () => {
    const { editor, upper, changes } = await open(two())
    click(upper, [150, 125])

    key('ArrowRight')
    key('ArrowDown', { shiftKey: true })
    key('ArrowLeft')
    key('ArrowUp')

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 109 })
    expect(changes.map((c) => c.cause)).toEqual(['nudge', 'nudge', 'nudge', 'nudge'])
  })

  it('nudges every selected Layer', async () => {
    const { editor, upper } = await open(two())
    drag(upper, [20, 20], [390, 290])

    key('ArrowLeft', { shiftKey: true })

    const [a, b] = editor.getDocument().layers
    expect(a).toMatchObject({ x: 90, y: 100 })
    expect(b!.x).toBeCloseTo(240, 6)
  })

  it('does nothing without a selection, while editing text, or when typing in a field', async () => {
    const { editor, upper, changes } = await open(doc([rect(), text({ id: 'text-1', x: 10, y: 200 })]))
    key('ArrowRight')
    const field = document.createElement('input')
    document.body.append(field)
    click(upper, [150, 125])
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    const box = editor.objectFor('text-1') as Textbox
    editor.objectFor('text-1')!.canvas!.setActiveObject(box)
    box.enterEditing()
    key('ArrowRight')
    box.exitEditing()

    expect(changes).toEqual([])
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100 })
    expect(editor.getDocument().layers[1]).toMatchObject({ x: 10 })
  })
})
