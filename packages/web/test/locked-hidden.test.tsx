// S2: Layers locked or hidden can be selected from the Layer list (`editor.select`)
// and edited in the Inspector, but on the Canvas they have no transform handles,
// cannot be dragged or nudged, and a click or marquee still passes them by.
import { describe, expect, it } from 'vitest'
import type { RectLayer } from '@bannerkit/core'
import { act } from '@testing-library/react'
import { doc, openEditor, rect } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

type At = [number, number]
const mouse = (target: EventTarget, type: string, [x, y]: At, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }))

/** A press at `from`, moves in a few steps, and a release at `to` (client px = Document px at zoom 1). */
function drag(upper: HTMLCanvasElement, from: At, to: At, init: MouseEventInit = {}) {
  mouse(upper, 'mousedown', from, init)
  for (const t of [0.25, 0.5, 0.75, 1]) {
    mouse(upper, 'mousemove', [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], init)
  }
  mouse(upper, 'mouseup', to, init)
}

const key = (key: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

const frozen: [string, Partial<RectLayer>][] = [
  ['locked', { locked: true }],
  ['hidden', { visible: false }],
]

describe('selecting locked and hidden Layers from the Layer list', () => {
  it('select keeps locked and hidden Layers', async () => {
    const { editor, selections } = await openEditor(
      doc([rect({ locked: true }), rect({ id: 'rect-2', visible: false }), rect({ id: 'rect-3' })]),
    )

    editor.select(['rect-1'])
    expect(editor.getSelection()).toEqual(['rect-1'])
    editor.select(['rect-2'])
    editor.select(['rect-3', 'rect-1', 'rect-2', 'nope'])

    expect(selections).toEqual([['rect-1'], ['rect-2'], ['rect-1', 'rect-2', 'rect-3']])
  })
})

describe.each(frozen)('a %s Layer selected from the list', (_, flag) => {
  it('has no handles: dragging where its right handle would be does not resize it', async () => {
    const original = doc([rect(flag)])
    const { editor, upper, changes } = await openEditor(original)
    editor.select(['rect-1'])

    drag(upper, [200, 125], [250, 125])

    expect(editor.getDocument()).toEqual(original)
    expect(changes).toEqual([])
  })

  it('cannot be dragged or nudged', async () => {
    const original = doc([rect(flag)])
    const { editor, upper, changes } = await openEditor(original)
    editor.select(['rect-1'])

    drag(upper, [150, 125], [180, 145])
    editor.select(['rect-1'])
    key('ArrowRight')
    key('ArrowDown', { shiftKey: true })

    expect(editor.getDocument()).toEqual(original)
    expect(changes).toEqual([])
  })

  it('in a Selection with a movable Layer, nothing moves or resizes', async () => {
    const original = doc([rect(flag), rect({ id: 'rect-2', x: 250 })])
    const { editor, upper, changes } = await openEditor(original)
    editor.select(['rect-1', 'rect-2'])

    drag(upper, [300, 125], [320, 135]) // inside rect-2
    editor.select(['rect-1', 'rect-2'])
    drag(upper, [350, 125], [380, 125]) // the Selection's right handle
    editor.select(['rect-1', 'rect-2'])
    key('ArrowLeft')

    expect(editor.getDocument()).toEqual(original)
    expect(changes).toEqual([])
  })
})

describe('selecting on the Canvas', () => {
  it('a click or a marquee passes locked and hidden Layers by', async () => {
    const { editor, upper, selections } = await openEditor(
      doc([
        rect({ x: 20, locked: true }),
        rect({ id: 'rect-2', x: 140, visible: false }),
        rect({ id: 'rect-3', x: 260 }),
      ]),
    )

    mouse(upper, 'mousedown', [70, 125])
    mouse(upper, 'mouseup', [70, 125])
    mouse(upper, 'mousedown', [190, 125])
    mouse(upper, 'mouseup', [190, 125])
    expect(editor.getSelection()).toEqual([])

    drag(upper, [5, 90], [395, 170])

    expect(editor.getSelection()).toEqual(['rect-3'])
    expect(selections).toEqual([['rect-3']])
  })
})

describe.each([
  ['Locked', 'locked', { locked: true }],
  ['Visible', 'hidden', { visible: false }],
] as const)('the Inspector toggle %s of a %s Layer', (name, _, flag) => {
  it('shows its fields; toggling keeps it selected, is one undo step, and frees it on the Canvas', async () => {
    const original = doc([rect(flag)])
    const { editor, user, toggle, field, upper, changes } = await openInspector(original, { select: ['rect-1'] })
    editor.setSnapping(false) // the drag itself, not Snapping (snapping.test.ts)
    expect(field('X').value).toBe('100')

    await user.click(toggle(name))
    await settle()

    expect(editor.getDocument()).toEqual(doc([rect()]))
    expect(editor.getSelection()).toEqual(['rect-1'])
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    drag(upper, [150, 125], [180, 145])
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 130, y: 120 })

    await act(() => editor.undo())
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('setting it back keeps the Layer selected and frozen again', async () => {
    const { editor, user, toggle, upper } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    await user.click(toggle(name))
    await settle()

    expect(editor.getDocument()).toEqual(doc([rect(flag)]))
    expect(editor.getSelection()).toEqual(['rect-1'])
    drag(upper, [150, 125], [180, 145])
    expect(editor.getDocument()).toEqual(doc([rect(flag)]))
  })

  it('in a Selection with another Layer, setting it freezes the whole Selection', async () => {
    const original = doc([rect(), rect({ id: 'rect-2', x: 250 })])
    const { editor, upper } = await openEditor(original)
    editor.select(['rect-1', 'rect-2'])

    await editor.update((d) => doc([rect(flag), d.layers[1]!]), { cause: 'inspector' })
    drag(upper, [300, 125], [320, 135])

    expect(editor.getSelection()).toEqual(['rect-1', 'rect-2'])
    expect(editor.getDocument()).toEqual(doc([rect(flag), rect({ id: 'rect-2', x: 250 })]))
  })
})
