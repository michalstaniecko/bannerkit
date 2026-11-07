// Selecting inside a Group on the Canvas, and locked/hidden inherited from Groups (ticket #26).
import type { GroupLayer, Layer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect } from './editor-harness.ts'

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
