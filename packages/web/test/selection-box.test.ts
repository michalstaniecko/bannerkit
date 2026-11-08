// The editor's `selectionBox` event (ticket #34): the Selection Box from core
// `selectionBox` (ADR 0008, never a Fabric outline), sent when the Selection changes,
// after every step and in every frame of a move or a resize, so the Ruler can follow it.
import type { GroupLayer, Layer, Rect } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect } from './editor-harness.ts'

const group = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

type At = [number, number]
const mouse = (target: EventTarget, type: string, [x, y]: At, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }))
const click = (upper: HTMLCanvasElement, at: At) => {
  mouse(upper, 'mousedown', at)
  mouse(upper, 'mouseup', at)
}

/** Opens `document_` and records every `selectionBox` event. */
async function open(document_: Parameters<typeof openEditor>[0]) {
  const opened = await openEditor(document_)
  const boxes: (Rect | null)[] = []
  opened.editor.on('selectionBox', ({ box }) => boxes.push(box))
  return { ...opened, boxes }
}

const expectBox = (box: Rect | null | undefined, expected: Rect) => {
  expect(box).not.toBeNull()
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(box![key]).toBeCloseTo(expected[key])
}

describe('selectionBox', () => {
  it('is the Selection Box when the Selection changes, and null once it is empty', async () => {
    const { editor, upper, boxes } = await open(doc([rect(), rect({ id: 'rect-2', x: 250, y: 200, width: 40, height: 40 })]))

    editor.select(['rect-1'])
    expect(boxes.at(-1)).toEqual({ x: 100, y: 100, width: 100, height: 50 })

    editor.select(['rect-1', 'rect-2'])
    expect(boxes.at(-1)).toEqual({ x: 100, y: 100, width: 190, height: 140 })

    click(upper, [20, 20]) // empty Canvas
    expect(boxes.at(-1)).toBeNull()
  })

  it('follows a click that selects a Layer', async () => {
    const { upper, boxes } = await open(doc([rect()]))

    click(upper, [150, 125])

    expect(boxes).toEqual([{ x: 100, y: 100, width: 100, height: 50 }])
  })

  it('is sent in every frame of a move, before the release', async () => {
    const { editor, upper, boxes } = await open(doc([rect()]))
    editor.select(['rect-1'])

    mouse(upper, 'mousedown', [150, 125])
    for (const dx of [10, 20, 30, 40]) mouse(upper, 'mousemove', [150 + dx, 125])

    expect(boxes.map((b) => b?.x)).toEqual(expect.arrayContaining([110, 120, 130, 140]))
    expect(boxes.at(-1)).toEqual({ x: 140, y: 100, width: 100, height: 50 })
    mouse(upper, 'mouseup', [190, 125])
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 140 })
  })

  it('in a move frame is the snapped Box, not the raw drag', async () => {
    // b (0..40) dragged by (147, 50) has its left edge 3 px from a's right edge (150): it snaps to 150.
    const { editor, upper, boxes } = await open(doc([rect({ id: 'a', x: 100, y: 200, width: 50, height: 50 }), rect({ id: 'b', x: 0, y: 0, width: 40, height: 40 })]))

    mouse(upper, 'mousedown', [20, 20])
    mouse(upper, 'mousemove', [90, 45])
    mouse(upper, 'mousemove', [167, 70])

    expect(editor.marks()).toHaveLength(1)
    expect(boxes.at(-1)).toEqual({ x: 150, y: 50, width: 40, height: 40 })
    mouse(upper, 'mouseup', [167, 70])
    expect(editor.getDocument().layers[1]).toMatchObject({ x: 150, y: 50 })
  })

  it('is sent in every frame of a resize, before the release', async () => {
    const { editor, upper, boxes } = await open(doc([rect()]))
    editor.select(['rect-1'])

    mouse(upper, 'mousedown', [200, 125]) // the right handle
    for (const dx of [10, 20, 30, 40]) mouse(upper, 'mousemove', [200 + dx, 125])

    expect(boxes.map((b) => b?.width)).toEqual(expect.arrayContaining([110, 120, 130, 140]))
    expectBox(boxes.at(-1), { x: 100, y: 100, width: 140, height: 50 })
    mouse(upper, 'mouseup', [240, 125])
  })

  it('follows a step: an undo puts the Box back', async () => {
    const { editor, upper, boxes } = await open(doc([rect()]))
    editor.select(['rect-1'])
    mouse(upper, 'mousedown', [150, 125])
    mouse(upper, 'mousemove', [170, 125])
    mouse(upper, 'mouseup', [170, 125])
    editor.select(['rect-1'])
    expect(boxes.at(-1)).toEqual({ x: 120, y: 100, width: 100, height: 50 })

    await editor.undo()
    editor.select(['rect-1'])

    expect(boxes).toContainEqual({ x: 100, y: 100, width: 100, height: 50 })
    expect(boxes.at(-1)).toEqual({ x: 100, y: 100, width: 100, height: 50 })
  })

  it('follows an Inspector-like update of the selected Layer, the Selection kept', async () => {
    const { editor, boxes } = await open(doc([rect()]))
    editor.select(['rect-1'])

    await editor.update((d) => ({ ...d, layers: [rect({ x: 30 })] }), { cause: 'inspector' })

    expect(boxes.at(-1)).toEqual({ x: 30, y: 100, width: 100, height: 50 })
  })

  it('of a rotated Layer is its rotated extent (layerExtent), not its Box', async () => {
    const { editor, boxes } = await open(doc([rect({ rotation: 90 })]))

    editor.select(['rect-1'])

    // 100×50 turned a quarter around its centre (150, 125): 50×100.
    expectBox(boxes.at(-1), { x: 125, y: 75, width: 50, height: 100 })
  })

  it('of a Group is the union of its Layers, and moves with it frame by frame', async () => {
    const { editor, upper, boxes } = await open(
      doc([group('group-1', [rect({ id: 'rect-2' }), group('group-2', [rect({ id: 'rect-3', x: 250, y: 200, width: 40, height: 40 })])])]),
    )
    editor.select(['group-1'])
    expect(boxes.at(-1)).toEqual({ x: 100, y: 100, width: 190, height: 140 })

    mouse(upper, 'mousedown', [150, 125])
    mouse(upper, 'mousemove', [160, 135])
    mouse(upper, 'mousemove', [175, 140])

    expectBox(boxes.at(-1), { x: 125, y: 115, width: 190, height: 140 })
    mouse(upper, 'mouseup', [175, 140])
  })
})
