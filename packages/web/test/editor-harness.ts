// Shared by editor and Inspector tests (jsdom + node-canvas): Document fixtures and
// `openEditor`, a real editor mounted in the page with its `change` and `selection`
// events recorded. Destroyed after each test.
import type { Document, ImageLayer, Layer, LeafLayer, MeasureText, RectLayer, TextLayer } from '@bannerkit/core'
import { afterEach } from 'vitest'
import { createEditor, type ChangeEvent, type Editor } from '../src/editor/index.ts'

export const doc = (layers: Layer[], over: Partial<Document> = {}): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width: 400, height: 300, background: '#ffffff' },
  layers,
  ...over,
})

/** The root Layers of a Document without Groups, typed as such (they all have a Box). */
export const leaves = (document_: Document): LeafLayer[] => document_.layers as LeafLayer[]

export const rect =(over: Partial<RectLayer> = {}): RectLayer => ({
  id: 'rect-1',
  type: 'rect',
  x: 100,
  y: 100,
  width: 100,
  height: 50,
  fill: '#ff0000',
  ...over,
})

export const text = (over: Partial<TextLayer> = {}): TextLayer => ({
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

/** An image Layer whose Asset (`assets/two-tone.png`) loads in `openEditor`. */
export const image = (over: Partial<ImageLayer> = {}): ImageLayer => ({
  id: 'image-1',
  type: 'image',
  x: 20,
  y: 20,
  width: 40,
  height: 20,
  src: 'assets/two-tone.png',
  fit: 'stretch',
  ...over,
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

const opened: Editor[] = []
afterEach(async () => {
  await Promise.all(opened.splice(0).map((e) => e.destroy()))
  document.body.innerHTML = ''
})

/**
 * Opens `document_` in a real editor mounted in the page (fonts are not loaded;
 * `assets/two-tone.png` loads, any other Asset is missing), measuring text with
 * `measure` when given. `changes` and `selections` record the editor's events from then on.
 */
export async function openEditor(document_: Document, { measure, container = document.createElement('div') }: { measure?: MeasureText; container?: HTMLElement } = {}) {
  document.body.append(container)
  const editor = createEditor({ loadFonts: async () => {}, measure })
  opened.push(editor)
  editor.mount(container)
  await editor.load(document_, {
    assetUrl: (src) => (src === 'assets/two-tone.png' ? twoToneImage() : 'data:image/png;base64,bm90IGFuIGltYWdl'),
  })
  const changes: ChangeEvent[] = []
  const selections: string[][] = []
  editor.on('change', (event) => changes.push(event))
  editor.on('selection', ({ layerIds }) => selections.push(layerIds))
  const upper = container.querySelector<HTMLCanvasElement>('canvas.upper-canvas')!
  return { editor, container, upper, changes, selections }
}

/** A point in client px; at zoom 1 in jsdom it is also the Canvas point (the canvas element sits at 0, 0). */
export type At = [number, number]

/** Dispatches one real mouse event of `type` at `at` on `target` (the `upper` canvas). */
export const mouse = (target: EventTarget, type: string, [x, y]: At, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }))

/**
 * A drag by real mouse events: pressed at `from` now, then `move(at)` as often as
 * needed (each move may carry its own modifier keys), then `release()`. Lets a test
 * look at the editor in the middle of a gesture (`marks()`, a reload from disk, …).
 */
export function gesture(upper: HTMLCanvasElement, from: At, init: MouseEventInit = {}) {
  let last = from
  mouse(upper, 'mousedown', from, init)
  return {
    move(to: At, moveInit: MouseEventInit = init) {
      last = to
      mouse(upper, 'mousemove', to, moveInit)
    },
    release(releaseInit: MouseEventInit = init) {
      mouse(upper, 'mouseup', last, releaseInit)
    },
  }
}

/** A press at `from`, a few moves along the way, and a release at `to`. */
export function drag(upper: HTMLCanvasElement, from: At, to: At, init: MouseEventInit = {}) {
  const g = gesture(upper, from, init)
  for (const t of [0.25, 0.5, 0.75, 1]) g.move([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])
  g.release()
}

/** A click (press and release without moving) at `at`. */
export const click = (upper: HTMLCanvasElement, at: At, init: MouseEventInit = {}) => {
  mouse(upper, 'mousedown', at, init)
  mouse(upper, 'mouseup', at, init)
}

/** A keydown of `name` on the page. */
export const key = (name: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }))
