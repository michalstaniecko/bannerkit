// Scaling and rotating a Group on the Canvas (ticket #27): corner handles scale it
// proportionally, the rotation handle turns it, each as one change that bakes the
// transform into every Layer in it (core scaleGroup / rotateGroup).
import type { GroupLayer, Layer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect, text } from './editor-harness.ts'

const group = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

type At = [number, number]
const mouse = (target: EventTarget, type: string, [x, y]: At, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }))
const click = (upper: HTMLCanvasElement, at: At) => {
  mouse(upper, 'mousedown', at)
  mouse(upper, 'mouseup', at)
}
function drag(upper: HTMLCanvasElement, from: At, to: At, init: MouseEventInit = {}) {
  mouse(upper, 'mousedown', from, init)
  for (const t of [0.25, 0.5, 0.75, 1]) mouse(upper, 'mousemove', [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], init)
  mouse(upper, 'mouseup', to, init)
}

/** group-1: rect-2 (100,100 100×50) and group-2 (rect-3 at 250,200 40×40); Box 100..290 × 100..240, centre (195, 170). */
const badge = () =>
  doc([
    rect({ id: 'rect-1', x: 10, y: 10, width: 30, height: 30 }),
    group('group-1', [
      rect({ id: 'rect-2', x: 100, y: 100, width: 100, height: 50 }),
      group('group-2', [rect({ id: 'rect-3', x: 250, y: 200, width: 40, height: 40 })]),
    ]),
  ])

const handle = (editor: Awaited<ReturnType<typeof openEditor>>['editor'], id: string, control: string): At => {
  const point = editor.objectFor(id)!.oCoords[control]!
  return [point.x, point.y]
}

describe('Group handles', () => {
  it('a selected Group has only corner handles and the rotation handle', async () => {
    const { editor, upper } = await openEditor(badge())
    click(upper, [150, 125])

    expect(Object.keys(editor.objectFor('group-1')!.controls).sort()).toEqual(['bl', 'br', 'mtr', 'tl', 'tr'])
  })

  it('a Selection holding a Group has only corner handles and the rotation handle too', async () => {
    const { editor, upper } = await openEditor(badge())
    drag(upper, [5, 5], [395, 295])
    expect(editor.getSelection()).toEqual(['rect-1', 'group-1'])

    const selection = editor.objectFor('group-1')!.group!

    expect(Object.keys(selection.controls).sort()).toEqual(['bl', 'br', 'mtr', 'tl', 'tr'])
  })
})

describe('scaling a Group', () => {
  it('a corner drag scales every Layer in it around the opposite corner, as one change', async () => {
    const { editor, upper, changes } = await openEditor(badge())
    click(upper, [150, 125])

    drag(upper, handle(editor, 'group-1', 'br'), [195, 170])

    expect(changes).toHaveLength(1)
    expect(changes[0]!.cause).toBe('transform')
    expect(changes[0]!.layerIds.sort()).toEqual(['group-1', 'group-2', 'rect-2', 'rect-3'])
    expect(changes[0]!.document).toEqual(
      doc([
        rect({ id: 'rect-1', x: 10, y: 10, width: 30, height: 30 }),
        group('group-1', [
          rect({ id: 'rect-2', x: 100, y: 100, width: 50, height: 25 }),
          group('group-2', [rect({ id: 'rect-3', x: 175, y: 150, width: 20, height: 20 })]),
        ]),
      ]),
    )
    expect(editor.getDocument()).toEqual(changes[0]!.document)
  })

  it('stays proportional with Shift held', async () => {
    const { editor, upper } = await openEditor(badge())
    click(upper, [150, 125])

    drag(upper, handle(editor, 'group-1', 'br'), [290, 170], { shiftKey: true })

    // Fabric's proportional scale: (190 + 70) / (190 + 140) ≈ 0.788, not 1 × 0.5
    const [rect2, inner] = (editor.getDocument().layers[1] as GroupLayer).layers as [Layer, GroupLayer]
    expect(rect2).toEqual(rect({ id: 'rect-2', x: 100, y: 100, width: 79, height: 39 }))
    expect(inner.layers[0]).toEqual(rect({ id: 'rect-3', x: 218, y: 179, width: 32, height: 32 }))
  })

  it('scales the type of a text Layer in it', async () => {
    const shown = doc([group('group-1', [text({ x: 100, y: 100, width: 200, height: 40, fontSize: 20, letterSpacing: 1 })])])
    const { editor, upper } = await openEditor(shown)
    editor.select(['group-1'])

    drag(upper, handle(editor, 'group-1', 'br'), [200, 120])

    expect((editor.getDocument().layers[0] as GroupLayer).layers[0]).toEqual(
      text({ x: 100, y: 100, width: 100, height: 20, fontSize: 10, letterSpacing: 0.5 }),
    )
  })

  it('is laid out again around its Layers, with no scale left on it', async () => {
    const { editor, upper } = await openEditor(badge())
    click(upper, [150, 125])

    drag(upper, handle(editor, 'group-1', 'br'), [195, 170])

    const object = editor.objectFor('group-1')!
    expect([object.angle, object.scaleX, object.scaleY]).toEqual([0, 1, 1])
    expect(object.getBoundingRect()).toMatchObject({ left: 100, top: 100, width: 95, height: 70 })
  })

  it('undo puts every Layer in it back, redo scales it again', async () => {
    const { editor, upper } = await openEditor(badge())
    click(upper, [150, 125])
    drag(upper, handle(editor, 'group-1', 'br'), [195, 170])
    const scaled = editor.getDocument()

    await editor.undo()
    expect(editor.getDocument()).toEqual(badge())
    await editor.redo()
    expect(editor.getDocument()).toEqual(scaled)
  })
})

describe('rotating a Group', () => {
  it('the rotation handle turns every Layer in it around the Group Box centre, as one change', async () => {
    const { editor, upper, changes } = await openEditor(badge())
    click(upper, [150, 125])

    drag(upper, handle(editor, 'group-1', 'mtr'), [195 + 200, 170]) // due right of the centre: 90°

    expect(changes).toHaveLength(1)
    expect(changes[0]!.layerIds.sort()).toEqual(['group-1', 'group-2', 'rect-2', 'rect-3'])
    // centres (150, 125) and (270, 220) turn 90° around (195, 170) to (240, 125) and (145, 245)
    expect(changes[0]!.document).toEqual(
      doc([
        rect({ id: 'rect-1', x: 10, y: 10, width: 30, height: 30 }),
        group('group-1', [
          rect({ id: 'rect-2', x: 190, y: 100, width: 100, height: 50, rotation: 90 }),
          group('group-2', [rect({ id: 'rect-3', x: 125, y: 225, width: 40, height: 40, rotation: 90 })]),
        ]),
      ]),
    )
    const object = editor.objectFor('group-1')!
    expect([object.angle, object.scaleX, object.scaleY]).toEqual([0, 1, 1])
  })

  it('undo puts every Layer in it back', async () => {
    const { editor, upper } = await openEditor(badge())
    click(upper, [150, 125])
    drag(upper, handle(editor, 'group-1', 'mtr'), [195 + 200, 170])

    await editor.undo()

    expect(editor.getDocument()).toEqual(badge())
  })

  it('a Group rotated with other Layers in a Selection turns around the Selection centre', async () => {
    const { editor, upper, changes } = await openEditor(badge())
    drag(upper, [5, 5], [395, 295])
    const selection = editor.objectFor('group-1')!.group!
    const centre = selection.getCenterPoint() // (150, 125): the Selection spans 10..290 × 10..240

    drag(upper, [selection.oCoords.mtr!.x, selection.oCoords.mtr!.y], [centre.x, centre.y + 150]) // due below: 180°

    expect(changes).toHaveLength(1)
    const [r1, g1] = editor.getDocument().layers as [Layer, GroupLayer]
    // each centre c turns to 2·(150, 125) − c
    expect(r1).toMatchObject({ x: 260, y: 210, rotation: 180 })
    expect(g1.layers[0]).toMatchObject({ x: 100, y: 100, rotation: 180 })
    expect((g1.layers[1] as GroupLayer).layers[0]).toMatchObject({ x: 10, y: 10, rotation: 180 })
  })
})
