// Selecting inside a Group on the Canvas, and locked/hidden inherited from Groups (ticket #26).
import type { GroupLayer, Layer, RectLayer } from '@bannerkit/core'
import type { Textbox } from 'fabric'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect, text } from './editor-harness.ts'

const group = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

type At = [number, number]
const mouse = (target: EventTarget, type: string, [x, y]: At, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }))
const click = (upper: HTMLCanvasElement, at: At, init: MouseEventInit = {}) => {
  mouse(upper, 'mousedown', at, init)
  mouse(upper, 'mouseup', at, init)
}
/** Two clicks then the browser's `dblclick`. */
const dblclick = (upper: HTMLCanvasElement, at: At) => {
  click(upper, at, { detail: 1 })
  click(upper, at, { detail: 2 })
  mouse(upper, 'dblclick', at, { detail: 2 })
}
function drag(upper: HTMLCanvasElement, from: At, to: At, init: MouseEventInit = {}) {
  mouse(upper, 'mousedown', from, init)
  for (const t of [0.25, 0.5, 0.75, 1]) mouse(upper, 'mousemove', [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], init)
  mouse(upper, 'mouseup', to, init)
}
const key = (key: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

/**
 * rect-1 (10,10 30×30) at the root, then group-1: rect-2 (100,100 100×50), rect-4
 * (100,170 40×40) and group-2 (rect-3 at 250,200 40×40).
 */
const nested = () =>
  doc([
    rect({ id: 'rect-1', x: 10, y: 10, width: 30, height: 30 }),
    group('group-1', [
      rect({ id: 'rect-2', x: 100, y: 100, width: 100, height: 50 }),
      rect({ id: 'rect-4', x: 100, y: 170, width: 40, height: 40 }),
      group('group-2', [rect({ id: 'rect-3', x: 250, y: 200, width: 40, height: 40 })]),
    ]),
  ])
const RECT_2: At = [150, 125]
const RECT_3: At = [270, 220]
const RECT_4: At = [120, 190]
const RECT_1: At = [25, 25]

describe('double-clicking a Group', () => {
  it('selects the Layer under the pointer one level down, then the next level', async () => {
    const { editor, upper } = await openEditor(nested())

    dblclick(upper, RECT_3)
    expect(editor.getSelection()).toEqual(['group-2'])

    dblclick(upper, RECT_3)
    expect(editor.getSelection()).toEqual(['rect-3'])
  })
})

describe('clicking with a Layer in a Group selected', () => {
  it('a click on another Layer of the same Group selects it', async () => {
    const { editor, upper, selections } = await openEditor(nested())
    editor.select(['rect-2'])

    click(upper, RECT_4)

    expect(editor.getSelection()).toEqual(['rect-4'])
    expect(selections.at(-1)).toEqual(['rect-4'])
  })

  it('a click on a nested Group of the same Group selects that Group, not its Layer', async () => {
    const { editor, upper } = await openEditor(nested())
    editor.select(['rect-2'])

    click(upper, RECT_3)

    expect(editor.getSelection()).toEqual(['group-2'])
  })

  it('a click outside the Group selects at the top level again', async () => {
    const { editor, upper } = await openEditor(nested())
    editor.select(['rect-2'])

    click(upper, RECT_1)
    expect(editor.getSelection()).toEqual(['rect-1'])

    click(upper, RECT_3)
    expect(editor.getSelection()).toEqual(['group-1'])
  })
})

describe('Cmd+click', () => {
  it('selects the deepest Layer under the pointer at once', async () => {
    const { editor, upper } = await openEditor(nested())

    click(upper, RECT_3, { metaKey: true })

    expect(editor.getSelection()).toEqual(['rect-3'])
  })
})

describe('Shift+click', () => {
  it('adds a Layer of the same Group to the Selection', async () => {
    const { editor, upper } = await openEditor(nested())
    editor.select(['rect-2'])

    click(upper, RECT_4, { shiftKey: true })

    expect(editor.getSelection()).toEqual(['rect-2', 'rect-4'])
  })

  it('adds a top-level Layer outside the Group, keeping the child', async () => {
    const { editor, upper } = await openEditor(nested())
    editor.select(['rect-2'])

    click(upper, RECT_1, { shiftKey: true })

    expect(editor.getSelection()).toEqual(['rect-1', 'rect-2'])
  })

  it('takes a selected Layer out again', async () => {
    const { editor, upper } = await openEditor(nested())
    editor.select(['rect-2', 'rect-4'])

    click(upper, RECT_4, { shiftKey: true })

    expect(editor.getSelection()).toEqual(['rect-2'])
  })

  it('selecting an ancestor of a selected Layer drops that Layer', async () => {
    const { editor, upper } = await openEditor(nested())
    editor.select(['rect-1', 'rect-3'])

    click(upper, RECT_2, { shiftKey: true }) // outside group-2: the top-level group-1

    expect(editor.getSelection()).toEqual(['rect-1', 'group-1'])
  })
})

describe('Escape', () => {
  it('selects the Group of the selected Layer, a level at a time', async () => {
    const { editor } = await openEditor(nested())
    editor.select(['rect-3'])

    expect(key('Escape')).toBe(false) // handled: default prevented
    expect(editor.getSelection()).toEqual(['group-2'])

    key('Escape')
    expect(editor.getSelection()).toEqual(['group-1'])
  })

  it('does nothing with only top-level Layers selected', async () => {
    const { editor } = await openEditor(nested())
    editor.select(['rect-1'])

    expect(key('Escape')).toBe(true)
    expect(editor.getSelection()).toEqual(['rect-1'])
  })
})

describe('changing a selected Layer in a Group', () => {
  /** `nested()` with rect-2 replaced by `over`. */
  const withRect2 = (over: Partial<RectLayer>) => {
    const d = nested()
    const g = d.layers[1] as GroupLayer
    g.layers[0] = { ...(g.layers[0] as RectLayer), ...over }
    return d
  }

  it('a drag moves only that Layer, as one change, and the Group Box follows', async () => {
    const { editor, upper, changes } = await openEditor(nested())
    editor.select(['rect-2'])

    drag(upper, RECT_2, [RECT_2[0] - 50.4, RECT_2[1] - 30.2])

    expect(changes).toHaveLength(1)
    expect(changes[0]!.cause).toBe('transform')
    expect(changes[0]!.layerIds).toEqual(['rect-2'])
    expect(changes[0]!.document).toEqual(withRect2({ x: 50, y: 70 }))
    expect(editor.getSelection()).toEqual(['rect-2'])
    expect(editor.objectFor('group-1')!.getBoundingRect()).toMatchObject({ left: 50, top: 70, width: 240, height: 170 })
  })

  it('a handle resizes it, as one change', async () => {
    const { editor, upper, changes } = await openEditor(nested())
    editor.select(['rect-2'])

    drag(upper, [200, 125], [250, 125]) // the right handle

    expect(changes.map((c) => c.layerIds)).toEqual([['rect-2']])
    expect(editor.getDocument()).toEqual(withRect2({ width: 150 }))
    expect(editor.objectFor('rect-2')!.scaleX).toBe(1)
  })

  it('the rotation handle rotates it, as one change', async () => {
    const { editor, upper, changes } = await openEditor(nested())
    editor.select(['rect-2'])
    const handle = editor.objectFor('rect-2')!.oCoords.mtr!

    drag(upper, [handle.x, handle.y], [150 + 200, 125]) // pointer due right of the centre

    expect(changes.map((c) => c.layerIds)).toEqual([['rect-2']])
    expect(editor.getDocument()).toEqual(withRect2({ rotation: 90 }))
  })

  it('an arrow key nudges only that Layer', async () => {
    const { editor, changes } = await openEditor(nested())
    editor.select(['rect-2'])

    key('ArrowDown')

    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([['nudge', ['rect-2']]])
    expect(editor.getDocument()).toEqual(withRect2({ y: 101 }))
  })

  it('a click on a selected text Layer in it starts editing; its new text is one change', async () => {
    const withText = doc([group('group-1', [rect({ id: 'rect-2' }), text({ id: 'text-1', x: 50, y: 200, width: 200 })])])
    const { editor, upper, changes } = await openEditor(withText)
    editor.select(['text-1'])
    const box = editor.objectFor('text-1') as Textbox

    click(upper, [100, 210])
    expect(box.isEditing).toBe(true)
    box.set({ text: 'Winter sale' })
    box.exitEditing()

    expect(changes.map((c) => [c.cause, c.layerIds])).toEqual([['text', ['text-1']]])
    expect((editor.getDocument().layers[0] as GroupLayer).layers[1]).toMatchObject({ text: 'Winter sale', x: 50, y: 200 })
  })
})

describe('the Selection shape', () => {
  it('select() never keeps a Layer together with its ancestor: the ancestor wins', async () => {
    const { editor } = await openEditor(nested())

    editor.select(['group-1', 'rect-3', 'rect-1'])

    expect(editor.getSelection()).toEqual(['rect-1', 'group-1'])
  })

  it('a rubber band takes top-level Layers only', async () => {
    const { editor, upper } = await openEditor(nested())
    editor.select(['rect-2'])

    drag(upper, [5, 5], [395, 295])

    expect(editor.getSelection()).toEqual(['rect-1', 'group-1'])
  })
})

describe('locked and hidden inherited from a Group', () => {
  /** rect-1 under the whole Canvas, then group-1 (`over`) holding group-2 holding rect-2 (100,100 100×50). */
  const under = (over: Partial<GroupLayer>) =>
    doc([
      rect({ id: 'rect-1', x: 0, y: 0, width: 400, height: 300 }),
      group('group-1', [group('group-2', [rect({ id: 'rect-2' })])], over),
    ])

  for (const [flag, over] of [
    ['locked', { locked: true }],
    ['hidden', { visible: false }],
  ] as const) {
    it(`a Layer deep in a ${flag} Group is not hit on the Canvas, even with Cmd+click`, async () => {
      const { editor, upper } = await openEditor(under(over))

      click(upper, RECT_2, { metaKey: true })
      expect(editor.getSelection()).toEqual(['rect-1'])
      dblclick(upper, RECT_2)
      expect(editor.getSelection()).toEqual(['rect-1'])
    })

    it(`a Layer deep in a ${flag} Group selected from the Layer list has no handles and does not move`, async () => {
      const shown = under(over)
      const { editor, changes } = await openEditor(shown)

      editor.select(['rect-2'])
      key('ArrowRight')

      const object = editor.objectFor('rect-2')!
      expect([object.hasControls, object.lockMovementX, object.lockMovementY]).toEqual([false, true, true])
      expect(changes).toEqual([])
      expect(editor.getDocument()).toEqual(shown)
    })
  }

  it('unlocking the Group gives its Layers their handles back', async () => {
    const { editor } = await openEditor(under({ locked: true }))
    editor.select(['rect-2'])

    await editor.update(
      (d) => {
        delete (d.layers[1] as GroupLayer).locked
        return d
      },
      { cause: 'inspector' },
    )

    const object = editor.objectFor('rect-2')!
    expect([object.hasControls, object.lockMovementX]).toEqual([true, false])
  })
})
