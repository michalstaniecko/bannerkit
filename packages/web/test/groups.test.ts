// Groups (Document v2) in the editor: shown as one Fabric object per Group with its
// children inside, selected and moved as a whole (ticket #23).
import type { GroupLayer, Layer, RectLayer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect, text } from './editor-harness.ts'

const group = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

/** rect-1 at the root, then group-1 (rect-2 + group-2 (text-1 rotated)) with opacity. */
const nested = () =>
  doc([
    rect({ id: 'rect-1', x: 10, y: 10, width: 30, height: 30 }),
    group(
      'group-1',
      [
        rect({ id: 'rect-2', x: 100, y: 100, width: 100, height: 50, fill: '#00ff00' }),
        group('group-2', [text({ id: 'text-1', x: 150.5, y: 130, width: 120, rotation: 12 })], { name: 'Inner', locked: false }),
      ],
      { name: 'Badge', opacity: 0.5 },
    ),
  ])

describe('a Document with Groups in the editor', () => {
  it('opens and comes back unchanged from getDocument', async () => {
    const shown = nested()
    const { editor } = await openEditor(shown)

    expect(editor.getDocument()).toEqual(shown)
    expect(JSON.stringify(editor.getDocument())).toBe(JSON.stringify(shown))
  })
})

describe('drawing a Group', () => {
  /** A red and a blue square overlapping on 140..160 × 100..150, in group-1 with `over`. */
  const overlapping = (over: Partial<GroupLayer>) =>
    doc([
      group(
        'group-1',
        [
          rect({ id: 'rect-1', x: 100, y: 100, width: 60, height: 50, fill: '#ff0000' }),
          rect({ id: 'rect-2', x: 140, y: 100, width: 60, height: 50, fill: '#0000ff' }),
        ],
        over,
      ),
    ])
  const pixel = (container: HTMLElement, x: number, y: number) => [
    ...container.querySelector<HTMLCanvasElement>('canvas.lower-canvas')!.getContext('2d')!.getImageData(x, y, 1, 1).data,
  ]

  it('composes its opacity like CSS: its Layers are flattened first, so they do not show through each other', async () => {
    const { container } = await openEditor(overlapping({ opacity: 0.5 }))

    // blue at 50% over white; a red at 50% under it would leave a purple tint
    const [r, g, b] = pixel(container, 150, 125)
    expect(Math.abs(r! - 128)).toBeLessThanOrEqual(1)
    expect(Math.abs(g! - 128)).toBeLessThanOrEqual(1)
    expect(b).toBe(255)
    const [r2, g2, b2] = pixel(container, 110, 125) // red only
    expect([r2, Math.abs(g2! - 128) <= 1, Math.abs(b2! - 128) <= 1]).toEqual([255, true, true])
  })

  it('draws nothing of a hidden Group', async () => {
    const { container } = await openEditor(overlapping({ visible: false }))

    expect(pixel(container, 150, 125)).toEqual([255, 255, 255, 255])
  })
})

describe('updating a Document with Groups', () => {
  it('lays a changed Layer in a Group out in place, keeping the Selection and its Group around it', async () => {
    const { editor } = await openEditor(nested())
    editor.select(['group-1'])
    const object = editor.objectFor('rect-2')

    await editor.update(
      (d) => {
        const g = d.layers[1] as GroupLayer
        g.layers[0] = { ...(g.layers[0] as RectLayer), x: 60, fill: '#123456' }
        return d
      },
      { cause: 'inspector' },
    )

    expect(editor.objectFor('rect-2')).toBe(object)
    expect(editor.getSelection()).toEqual(['group-1'])
    expect((editor.getDocument().layers[1] as GroupLayer).layers[0]).toMatchObject({ x: 60, fill: '#123456' })
    expect(editor.objectFor('group-1')!.getBoundingRect().left).toBe(60)
  })

  it('shows a Document whose Groups changed shape afresh', async () => {
    const { editor } = await openEditor(nested())
    const regrouped = doc([group('group-9', [rect({ id: 'rect-1' })]), rect({ id: 'rect-2', x: 300 })])

    await editor.apply(regrouped, { cause: 'json' })

    expect(editor.getDocument()).toEqual(regrouped)
  })
})

type At = [number, number]
const mouse = (target: EventTarget, type: string, [x, y]: At, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }))
const click = (upper: HTMLCanvasElement, at: At, init: MouseEventInit = {}) => {
  mouse(upper, 'mousedown', at, init)
  mouse(upper, 'mouseup', at, init)
}
function drag(upper: HTMLCanvasElement, from: At, to: At) {
  mouse(upper, 'mousedown', from)
  for (const t of [0.25, 0.5, 0.75, 1]) mouse(upper, 'mousemove', [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])
  mouse(upper, 'mouseup', to)
}
const key = (key: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

/** group-1: rect-2 (100,100 100×50) and group-2 (rect-3 at 250,200 40×40). */
const flat = () =>
  doc([
    rect({ id: 'rect-1', x: 10, y: 10, width: 30, height: 30 }),
    group('group-1', [
      rect({ id: 'rect-2', x: 100, y: 100, width: 100, height: 50 }),
      group('group-2', [rect({ id: 'rect-3', x: 250, y: 200, width: 40, height: 40 })]),
    ]),
  ])

describe('selecting a Group on the Canvas', () => {
  it('a click on any Layer in it selects the top-level Group', async () => {
    const { editor, upper, selections } = await openEditor(flat())

    click(upper, [270, 220]) // rect-3, two Groups deep

    expect(editor.getSelection()).toEqual(['group-1'])
    expect(selections).toEqual([['group-1']])
  })

  it('a click on an empty part of its Box selects nothing', async () => {
    const { editor, upper } = await openEditor(flat())

    click(upper, [120, 220]) // inside group-1's Box (100..290 × 100..240), on no Layer

    expect(editor.getSelection()).toEqual([])
  })

  it('a locked Group is not hit, so the Layer under it is', async () => {
    const { editor, upper } = await openEditor(
      doc([rect({ id: 'rect-1', x: 90, y: 90, width: 200, height: 200 }), group('group-1', [rect({ id: 'rect-2' })], { locked: true })]),
    )

    click(upper, [150, 125])

    expect(editor.getSelection()).toEqual(['rect-1'])
  })

  it('a hidden Group is not hit', async () => {
    const { editor, upper } = await openEditor(doc([group('group-1', [rect({ id: 'rect-2' })], { visible: false })]))

    click(upper, [150, 125])

    expect(editor.getSelection()).toEqual([])
  })
})

describe('moving a Group', () => {
  it('a drag moves every Layer in it by the same whole-pixel delta, as one change', async () => {
    const { editor, upper, changes } = await openEditor(flat())

    drag(upper, [150, 125], [180.4, 145.6])

    expect(changes).toHaveLength(1)
    expect(changes[0]!.cause).toBe('transform')
    expect(changes[0]!.layerIds.sort()).toEqual(['group-1', 'group-2', 'rect-2', 'rect-3'])
    expect(changes[0]!.document).toEqual(
      doc([
        rect({ id: 'rect-1', x: 10, y: 10, width: 30, height: 30 }),
        group('group-1', [
          rect({ id: 'rect-2', x: 130, y: 121, width: 100, height: 50 }),
          group('group-2', [rect({ id: 'rect-3', x: 280, y: 221, width: 40, height: 40 })]),
        ]),
      ]),
    )
    expect(editor.getDocument()).toEqual(changes[0]!.document)
  })

  it('is laid out again around its Layers, so it can be moved again', async () => {
    const { editor, upper } = await openEditor(flat())
    drag(upper, [150, 125], [180, 145])

    drag(upper, [300, 241], [310, 251]) // rect-3, where it is now

    const moved = editor.getDocument().layers[1] as GroupLayer
    expect(moved.layers[0]).toMatchObject({ x: 140, y: 130 })
    const object = editor.objectFor('group-1')!
    expect([object.angle, object.scaleX, object.scaleY]).toEqual([0, 1, 1])
    expect(object.getBoundingRect()).toMatchObject({ left: 140, top: 130, width: 190, height: 140 })
  })

  it('an arrow key nudges every Layer in it, as one change', async () => {
    const { editor, upper, changes } = await openEditor(flat())
    click(upper, [150, 125])

    key('ArrowRight', { shiftKey: true })

    expect(changes).toHaveLength(1)
    expect(changes[0]!.cause).toBe('nudge')
    const moved = editor.getDocument().layers[1] as GroupLayer
    expect(moved.layers[0]).toMatchObject({ x: 110, y: 100 })
    expect((moved.layers[1] as GroupLayer).layers[0]).toMatchObject({ x: 260, y: 200 })
  })

  it('undo and redo the move', async () => {
    const { editor, upper } = await openEditor(flat())
    drag(upper, [150, 125], [180, 145])
    const moved = editor.getDocument()

    await editor.undo()
    expect(editor.getDocument()).toEqual(flat())
    await editor.redo()
    expect(editor.getDocument()).toEqual(moved)
  })

  it('moves with other Layers in a rubber-band Selection', async () => {
    const { editor, upper, changes } = await openEditor(flat())
    drag(upper, [5, 5], [395, 295])
    expect(editor.getSelection()).toEqual(['rect-1', 'group-1'])

    drag(upper, [20, 20], [25, 30])

    expect(changes).toHaveLength(1)
    const [r1, g1] = editor.getDocument().layers as [Layer, GroupLayer]
    expect(r1).toMatchObject({ x: 15, y: 20 })
    expect(g1.layers[0]).toMatchObject({ x: 105, y: 110 })
    expect((g1.layers[1] as GroupLayer).layers[0]).toMatchObject({ x: 255, y: 210 })
  })

  it('a locked Group selected from the Layer list does not move', async () => {
    const locked = doc([group('group-1', [rect({ id: 'rect-2' })], { locked: true })])
    const { editor, changes } = await openEditor(locked)
    editor.select(['group-1'])

    key('ArrowRight')

    expect(changes).toEqual([])
    expect(editor.getDocument()).toEqual(locked)
  })
})
