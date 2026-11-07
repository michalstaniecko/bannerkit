// S2: the editor module (mount / load / getDocument) under jsdom + node-canvas.
// Geometry is checked through rendered pixels; no text metrics here (spec, S2).
import type { Document, Layer } from '@bannerkit/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, type Editor } from '../src/editor/index.ts'

const doc = (layers: Layer[], canvas: Partial<Document['canvas']> = {}): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width: 200, height: 100, background: '#ffffff', ...canvas },
  layers,
})

let editor: Editor | undefined
afterEach(async () => {
  await editor?.destroy()
  editor = undefined
  document.body.innerHTML = ''
})

async function open(document_: Document): Promise<{ editor: Editor; container: HTMLElement }> {
  const container = document.createElement('div')
  document.body.append(container)
  editor = createEditor()
  editor.mount(container)
  await editor.load(document_)
  return { editor, container }
}

describe('load → getDocument', () => {
  it('round-trips a plain rect Document unchanged', async () => {
    const original = doc([{ id: 'rect-1', type: 'rect', x: 10, y: 20, width: 100, height: 50, fill: '#ff0000' }])

    const { editor } = await open(original)

    expect(editor.getDocument()).toEqual(original)
  })
})

/** The RGBA of one Canvas pixel, read from the canvas element the editor mounted. */
function pixel(container: HTMLElement, x: number, y: number): [number, number, number, number] {
  const element = container.querySelector<HTMLCanvasElement>('canvas.lower-canvas')!
  const [r, g, b, a] = element.getContext('2d')!.getImageData(x, y, 1, 1).data
  return [r!, g!, b!, a!]
}

const RED: [number, number, number, number] = [255, 0, 0, 255]
const WHITE: [number, number, number, number] = [255, 255, 255, 255]
const rect = (over: Partial<Extract<Layer, { type: 'rect' }>> = {}): Layer => ({
  id: 'rect-1',
  type: 'rect',
  x: 50,
  y: 25,
  width: 100,
  height: 50,
  fill: '#ff0000',
  ...over,
})

describe('mount / destroy', () => {
  it('destroy leaves the container as mount found it, so a remount shows one Canvas', async () => {
    const { editor: first, container } = await open(doc([]))
    await first.destroy()
    expect(container.children).toHaveLength(0)

    editor = createEditor()
    editor.mount(container)
    await editor.load(doc([]))
    expect(container.querySelectorAll('canvas.lower-canvas')).toHaveLength(1)
    expect(container.querySelectorAll('canvas')).toHaveLength(2)
  })
})

describe('rect Layers on the Canvas', () => {
  it('places the Box by its top-left', async () => {
    const { container } = await open(doc([rect()]))

    expect(pixel(container, 51, 26)).toEqual(RED)
    expect(pixel(container, 148, 73)).toEqual(RED)
    expect(pixel(container, 49, 24)).toEqual(WHITE)
    expect(pixel(container, 151, 76)).toEqual(WHITE)
  })

  it('rotates the Box around its centre', async () => {
    const original = doc([rect({ rotation: 90 })])

    const { editor, container } = await open(original)

    // centre (100, 50); rotated 90° the Box spans x 75..125, y 0..100
    expect(pixel(container, 80, 3)).toEqual(RED)
    expect(pixel(container, 120, 97)).toEqual(RED)
    expect(pixel(container, 60, 50)).toEqual(WHITE)
    expect(editor.getDocument()).toEqual(original)
  })

  it('fills with a CSS-convention linear gradient (90 = to right)', async () => {
    const { container } = await open(doc([rect({ fill: { type: 'linear', angle: 90, stops: [['#ff0000', 0], ['#0000ff', 1]] } })]))

    const [lr, , lb] = pixel(container, 52, 50)
    const [rr, , rb] = pixel(container, 148, 50)
    expect(lr).toBeGreaterThan(240)
    expect(lb).toBeLessThan(15)
    expect(rr).toBeLessThan(15)
    expect(rb).toBeGreaterThan(240)
  })

  it('follows the gradient angle (180 = to bottom)', async () => {
    const { container } = await open(doc([rect({ fill: { type: 'linear', angle: 180, stops: [['#ff0000', 0], ['#0000ff', 1]] } })]))

    expect(pixel(container, 100, 27)[0]).toBeGreaterThan(230)
    expect(pixel(container, 100, 73)[2]).toBeGreaterThan(230)
  })

  it('rounds corners, clamping the radius to the shorter side like the server', async () => {
    const { container } = await open(doc([rect({ cornerRadius: 1000 })]))

    // radius clamps to 25 (circular corners), not 50 × 25 (elliptical)
    expect(pixel(container, 51, 26)).toEqual(WHITE)
    expect(pixel(container, 70, 27)).toEqual(RED)
    expect(pixel(container, 100, 50)).toEqual(RED)
  })

  it('applies opacity', async () => {
    const { container } = await open(doc([rect({ opacity: 0.5 })]))

    const [r, g, b] = pixel(container, 100, 50)
    expect(r).toBe(255)
    expect(g).toBeGreaterThan(120)
    expect(g).toBeLessThan(135)
    expect(b).toBe(g)
  })

  it('draws the shadow offset in Canvas pixels', async () => {
    const { container } = await open(
      doc([rect({ shadow: { color: '#000000', blur: 0, offsetX: 20, offsetY: 10 } })]),
    )

    expect(pixel(container, 160, 80)).toEqual([0, 0, 0, 255])
    expect(pixel(container, 55, 80)).toEqual(WHITE)
  })

  it('does not draw a hidden Layer', async () => {
    const original = doc([rect({ visible: false })])

    const { editor, container } = await open(original)

    expect(pixel(container, 100, 50)).toEqual(WHITE)
    expect(editor.getDocument()).toEqual(original)
  })

  it('stacks Layers bottom to top', async () => {
    const { container } = await open(doc([rect(), rect({ id: 'rect-2', x: 100, fill: '#0000ff' })]))

    expect(pixel(container, 75, 50)).toEqual(RED)
    expect(pixel(container, 125, 50)).toEqual([0, 0, 255, 255])
  })

  it('paints the Canvas background, or leaves it transparent when null', async () => {
    const tinted = await open(doc([], { background: '#00ff00' }))
    expect(pixel(tinted.container, 5, 5)).toEqual([0, 255, 0, 255])
    await editor?.destroy()

    const clear = await open(doc([], { background: null }))
    expect(pixel(clear.container, 5, 5)[3]).toBe(0)
  })
})

describe('locking', () => {
  it('makes a locked Layer unselectable and an unlocked one selectable', async () => {
    const { editor } = await open(doc([rect({ locked: true }), rect({ id: 'rect-2' })]))

    expect(editor.objectFor('rect-1')?.selectable).toBe(false)
    expect(editor.objectFor('rect-2')?.selectable).toBe(true)
  })
})

describe('round-trip', () => {
  it('returns a Document using every rect feature unchanged', async () => {
    const original = doc([
      rect({
        x: 12.5,
        y: -7.25,
        width: 33.3,
        height: 17.1,
        rotation: -37.5,
        opacity: 0.8,
        visible: true,
        locked: true,
        cornerRadius: 6,
        shadow: { color: 'rgba(0,0,0,0.5)', blur: 8, offsetX: 2, offsetY: 4 },
        fill: { type: 'linear', angle: 45, stops: [['#ff0000', 0], ['#00ff00', 0.4], ['#0000ff', 1]] },
      }),
      rect({ id: 'rect-2', rotation: 0, opacity: 1, visible: false }),
    ])

    const { editor } = await open(original)

    expect(editor.getDocument()).toEqual(original)
  })

  it('bakes a resize (object scale) into width/height, keeping the Box centre', async () => {
    const { editor } = await open(doc([rect()]))

    editor.objectFor('rect-1')!.set({ scaleX: 2, scaleY: 0.5 })

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 0, y: 37.5, width: 200, height: 25 })
  })
})

describe('zoom', () => {
  it('fits the Canvas into the viewport and scales the canvas element with it', async () => {
    const { editor, container } = await open(doc([rect()]))

    const zoom = editor.zoomToFit({ width: 100, height: 100 })

    const element = container.querySelector<HTMLCanvasElement>('canvas.lower-canvas')!
    expect(zoom).toBe(0.5)
    expect([element.width, element.height]).toEqual([100, 50])
    expect(pixel(container, 26, 13)).toEqual(RED)
    expect(pixel(container, 76, 13)).toEqual(WHITE)
  })

  it('keeps the zoom across loads and never changes the Document', async () => {
    const original = doc([rect()])
    const { editor, container } = await open(doc([]))
    editor.setZoom(2)

    await editor.load(original)

    const element = container.querySelector<HTMLCanvasElement>('canvas.lower-canvas')!
    expect([element.width, element.height]).toEqual([400, 200])
    expect(pixel(container, 102, 52)).toEqual(RED)
    expect(editor.getDocument()).toEqual(original)
  })
})
