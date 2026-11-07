// S4: the Canvas resize handles (jsdom + node-canvas, real mouse events). Dragging an
// edge or a corner keeps the opposite side put; the Canvas previews every size with a
// `W × H` label, and only the release is a step: one undo step, one `resize` change.
import { MAX_CANVAS_SIDE } from '@bannerkit/core'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CanvasHandles } from '../src/CanvasHandles.tsx'
import { doc, openEditor, rect } from './editor-harness.ts'
import { settle } from './inspector-harness.tsx'

afterEach(cleanup)

type Point = { clientX: number; clientY: number }

/** Dispatches one real mouse event (`buttons` held except on `mouseup`) and lets the editor settle. */
async function mouse(target: EventTarget, type: 'mousedown' | 'mousemove' | 'mouseup', { clientX, clientY }: Point) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: type === 'mouseup' ? 0 : 1 }))
    await settle()
  })
}

async function key(key: string) {
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await settle()
  })
}

/** Opens a 400×300 Canvas with a rect at (100, 100) and its handles at `zoom`. */
async function openHandles({ zoom = 1 } = {}) {
  const opened = await openEditor(doc([rect()]))
  opened.editor.setZoom(zoom)
  render(<CanvasHandles editor={{ current: opened.editor }} loaded />)
  const handle = (name: string) => screen.getByLabelText(`Canvas handle: ${name}`)
  return { ...opened, handle }
}

/** Drags `target` from (100, 100) by (dx, dy) screen px in two moves, then releases. */
async function drag(target: Element, dx: number, dy: number, { release = true } = {}) {
  await mouse(target, 'mousedown', { clientX: 100, clientY: 100 })
  await mouse(document.body, 'mousemove', { clientX: 100 + dx / 2, clientY: 100 + dy / 2 })
  await mouse(document.body, 'mousemove', { clientX: 100 + dx, clientY: 100 + dy })
  if (release) await mouse(document.body, 'mouseup', { clientX: 100 + dx, clientY: 100 + dy })
}

describe('Canvas resize handles', () => {
  it('dragging the right edge widens the Canvas, keeping the left edge (and the Layers) put', async () => {
    const { editor, handle, changes } = await openHandles()

    await drag(handle('right edge'), 40, 25)

    expect(editor.getDocument().canvas).toMatchObject({ width: 440, height: 300 })
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 100 })
    expect(changes.map((c) => c.cause)).toEqual(['resize'])
  })

  it('dragging the left edge keeps the right edge put: the Layers move with the left edge', async () => {
    const { editor, handle } = await openHandles()

    await drag(handle('left edge'), -30, 10)

    expect(editor.getDocument().canvas).toMatchObject({ width: 430, height: 300 })
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 130, y: 100 })
  })

  it('dragging a corner keeps the opposite corner put', async () => {
    const { editor, handle } = await openHandles()

    await drag(handle('top-left corner'), 20, 30)

    expect(editor.getDocument().canvas).toMatchObject({ width: 380, height: 270 })
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 80, y: 70, width: 100, height: 50 })
  })

  it('previews the size with a W × H label and no step until the release, clamped to the Canvas limits', async () => {
    const { editor, handle, changes } = await openHandles()

    await drag(handle('bottom-right corner'), -1000, 20, { release: false })

    expect(editor.getDocument().canvas).toMatchObject({ width: 1, height: 320 })
    expect(screen.getByText('1 × 320')).toBeTruthy()
    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)

    await mouse(document.body, 'mousemove', { clientX: 100, clientY: 100 + MAX_CANVAS_SIDE * 2 })
    expect(screen.getByText(`400 × ${MAX_CANVAS_SIDE}`)).toBeTruthy()

    await mouse(document.body, 'mouseup', { clientX: 100, clientY: 100 + MAX_CANVAS_SIDE * 2 })
    expect(screen.queryByText(/×/)).toBeNull()
    expect(changes).toHaveLength(1)
    expect(changes[0]!.document.canvas).toMatchObject({ width: 400, height: MAX_CANVAS_SIDE })
  })

  it('the release is one undo step, and undo restores the size and the Layers', async () => {
    const { editor, handle, changes } = await openHandles()

    await drag(handle('top edge'), 0, -50)
    expect(editor.getDocument().canvas).toMatchObject({ width: 400, height: 350 })
    expect(changes.map((c) => c.cause)).toEqual(['resize'])

    await editor.undo()

    expect(editor.getDocument().canvas).toMatchObject({ width: 400, height: 300 })
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 100 })
    expect(editor.canUndo()).toBe(false)
  })

  it('Escape cancels the drag: the size from before, no step, no change, and the release does nothing', async () => {
    const { editor, handle, changes } = await openHandles()

    await drag(handle('right edge'), 60, 0, { release: false })
    expect(editor.getDocument().canvas.width).toBe(460)
    await key('Escape')

    expect(editor.getDocument().canvas).toMatchObject({ width: 400, height: 300 })
    expect(screen.queryByText(/×/)).toBeNull()
    await mouse(document.body, 'mousemove', { clientX: 200, clientY: 100 })
    await mouse(document.body, 'mouseup', { clientX: 200, clientY: 100 })
    expect(editor.getDocument().canvas.width).toBe(400)
    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })

  it('screen px are divided by the zoom, which stays put during the drag', async () => {
    const { editor, handle } = await openHandles({ zoom: 2 })

    await drag(handle('bottom edge'), 0, 41, { release: false })
    expect(editor.getZoom()).toBe(2)
    expect(editor.getDocument().canvas.height).toBe(321)
    await mouse(document.body, 'mouseup', { clientX: 100, clientY: 141 })

    expect(editor.getZoom()).toBe(2)
    expect(editor.getDocument().canvas.height).toBe(321)
  })

  it('a click without a move makes no step', async () => {
    const { handle, changes, editor } = await openHandles()

    await drag(handle('right edge'), 0, 0)

    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })
})
