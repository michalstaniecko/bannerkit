// Guides dragged out of, along and back onto the Rulers (jsdom + node-canvas, real mouse
// events on the Ruler's <canvas>). jsdom delivers the events with their client
// coordinates but lays nothing out (every rect is 0 × 0 at 0, 0), so the Rulers and the
// Canvas get stubbed screen rects: the Canvas at (100, 100), the top Ruler in the 20 px
// above it, the left Ruler in the 20 px left of it.
import type { Document } from '@bannerkit/core'
import { act } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { Ruler } from '../src/Ruler.tsx'
import { doc, openEditor, rect } from './editor-harness.ts'
import { settle } from './inspector-harness.tsx'
import { render } from './render.tsx'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const placeAt = (element: Element, left: number, top: number, width: number, height: number) => {
  element.getBoundingClientRect = () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) })
}

async function openRulers(document_: Document) {
  const opened = await openEditor(document_)
  const { container, editor } = opened
  placeAt(container, 100, 100, 400, 300)
  placeAt(container.querySelector('canvas.lower-canvas')!, 100, 100, 400, 300)
  const props = { editor: { current: editor }, loaded: true, viewportRef: { current: null }, hostRef: { current: container }, zoom: 1 }
  const view = render(
    <>
      <div className="ruler-top">
        <Ruler axis="x" {...props} />
      </div>
      <div className="ruler-left">
        <Ruler axis="y" {...props} />
      </div>
    </>,
  )
  const top = view.querySelector<HTMLCanvasElement>('.ruler-top canvas')!
  const left = view.querySelector<HTMLCanvasElement>('.ruler-left canvas')!
  placeAt(top, 0, 80, 600, 20)
  placeAt(left, 80, 0, 20, 500)
  return { ...opened, top, left }
}

async function mouse(target: EventTarget, type: string, clientX: number, clientY: number) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }))
    await settle()
  })
}

/** Presses on `ruler` at `from`, moves over the page through `via`, releases at the last point. */
async function drag(ruler: HTMLCanvasElement, from: [number, number], ...via: [number, number][]) {
  await mouse(ruler, 'mousedown', ...from)
  for (const point of via) await mouse(document, 'mousemove', ...point)
  await mouse(document, 'mouseup', ...via.at(-1)!)
}

const frame = () => act(() => new Promise((resolve) => requestAnimationFrame(resolve)))

describe('Guides and the Rulers', () => {
  it('jsdom delivers mouse events on the Ruler canvas with their client coordinates', async () => {
    const { top } = await openRulers(doc([]))
    const seen: [number, number][] = []
    top.addEventListener('mousedown', (e) => seen.push([e.clientX, e.clientY]))
    await mouse(top, 'mousedown', 150, 90)
    expect(seen).toEqual([[150, 90]])
    await mouse(document, 'mouseup', 150, 90)
  })

  it('dragging out of the top Ruler creates a horizontal Guide, one guides step', async () => {
    const { editor, top, changes } = await openRulers(doc([]))
    await drag(top, [150, 90], [150, 130], [150, 160.4])

    expect(editor.getDocument().guides).toEqual({ x: [], y: [60] })
    expect(changes.map((c) => c.cause)).toEqual(['guides'])
  })

  it('dragging out of the left Ruler creates a vertical Guide', async () => {
    const { editor, left } = await openRulers(doc([]))
    await drag(left, [90, 200], [150, 200], [181, 200])

    expect(editor.getDocument().guides).toEqual({ x: [81], y: [] })
  })

  it('shows the dragged value next to the marker on its Ruler, and each Guide as a marker', async () => {
    const { left, top } = await openRulers(doc([], { guides: { x: [30], y: [] } }))
    await mouse(top, 'mousedown', 150, 90)
    await mouse(document, 'mousemove', 150, 161)
    await frame()
    expect(left.dataset.guides).toBe('61@161')
    expect(left.dataset.guideValue).toBe('61@161')
    expect(top.dataset.guides).toBe('30@130')
    await mouse(document, 'mouseup', 150, 161)
    await frame()
    expect(left.dataset.guideValue).toBe('')
  })

  it('a Guide is moved by its marker, also one off the Canvas', async () => {
    const { editor, top, changes } = await openRulers(doc([rect()], { guides: { x: [250, -50], y: [] } }))
    // x = −50 is at client x 50 on the top Ruler
    await drag(top, [51, 90], [40, 200], [30, 200])

    expect(editor.getDocument().guides).toEqual({ x: [250, -70], y: [] })
    expect(changes.map((c) => c.cause)).toEqual(['guides'])
  })

  it('dropping a Guide on any Ruler removes it', async () => {
    const { editor, left } = await openRulers(doc([], { guides: { x: [10], y: [40] } }))
    // y = 40 is at client y 140 on the left Ruler; released over the top Ruler
    await drag(left, [90, 140], [300, 160], [300, 90])
    expect(editor.getDocument().guides).toEqual({ x: [10], y: [] })
  })

  it('a click on a Ruler without a move creates nothing', async () => {
    const { editor, top, left, changes } = await openRulers(doc([]))
    await mouse(top, 'mousedown', 150, 90)
    await mouse(document, 'mouseup', 150, 90)
    await mouse(left, 'mousedown', 90, 150)
    await mouse(document, 'mouseup', 90, 150)

    expect(editor.getDocument()).not.toHaveProperty('guides')
    expect(changes).toEqual([])
  })
})
