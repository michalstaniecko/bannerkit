// Grouping in the editor (#25): Cmd+G groups the Selection, Cmd+Shift+G ungroups every
// selected Group. Each is one `change` and one undo step, and blocks the browser's own
// shortcut; neither acts while a field has the focus.
import type { Layer } from '@bannerkit/core'
import { describe, expect, it, vi } from 'vitest'
import { doc, openEditor, rect } from './editor-harness.ts'

const three = () => doc([rect({ id: 'rect-1', x: 0 }), rect({ id: 'rect-2', x: 120 }), rect({ id: 'rect-3', x: 240 })])

/** Presses Cmd+G (Cmd+Shift+G with `shift`) on `target`; answers the event. */
function pressGroupKey(target: EventTarget, { shift = false, ctrl = false } = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: shift ? 'G' : 'g',
    metaKey: !ctrl,
    ctrlKey: ctrl,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

/** Lets a step the editor started settle (fonts, layout). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('Cmd+G', () => {
  it('groups the Selection into a new unnamed Group, selected, as one undo step', async () => {
    const original = three()
    const { editor, changes } = await openEditor(original)
    editor.select(['rect-1', 'rect-3'])

    const event = pressGroupKey(document)
    await vi.waitFor(() => expect(changes).toHaveLength(1))

    expect(event.defaultPrevented).toBe(true)
    expect(changes[0]!.cause).toBe('layers')
    expect(editor.getDocument().layers).toEqual([
      rect({ id: 'rect-2', x: 120 }),
      { id: 'group-1', type: 'group', layers: [rect({ id: 'rect-1', x: 0 }), rect({ id: 'rect-3', x: 240 })] },
    ])
    expect(editor.getSelection()).toEqual(['group-1'])

    await editor.undo()
    expect(editor.getDocument()).toEqual(original)
    expect(editor.canUndo()).toBe(false)
  })

  it('works with Ctrl too', async () => {
    const { editor, changes } = await openEditor(three())
    editor.select(['rect-2'])

    pressGroupKey(document, { ctrl: true })
    await vi.waitFor(() => expect(changes).toHaveLength(1))
    expect(editor.getSelection()).toEqual(['group-1'])
  })

  it('does nothing (but still blocks the browser) for Layers of different parents or no Selection', async () => {
    const nested: Layer = { id: 'group-1', type: 'group', layers: [rect({ id: 'rect-2' })] }
    const { editor, changes } = await openEditor(doc([rect({ id: 'rect-1' }), nested]))

    expect(pressGroupKey(document).defaultPrevented).toBe(true)
    editor.select(['rect-1', 'rect-2'])
    pressGroupKey(document)
    await settle()

    expect(changes).toEqual([])
  })

  it('is left to a field that has the focus', async () => {
    const { editor, changes } = await openEditor(three())
    editor.select(['rect-1'])
    const input = document.createElement('input')
    document.body.append(input)

    const event = pressGroupKey(input)
    await settle()

    expect(event.defaultPrevented).toBe(false)
    expect(changes).toEqual([])
  })
})

describe('Cmd+Shift+G', () => {
  it('ungroups every selected Group and selects their former children, as one undo step', async () => {
    const original = doc([
      { id: 'group-1', type: 'group', opacity: 0.5, layers: [rect({ id: 'rect-1', x: 0 }), rect({ id: 'rect-2', x: 120 })] },
      rect({ id: 'rect-3', x: 240 }),
      { id: 'group-2', type: 'group', layers: [rect({ id: 'rect-4', y: 200 })] },
    ])
    const { editor, changes } = await openEditor(original)
    editor.select(['group-1', 'group-2'])

    const event = pressGroupKey(document, { shift: true })
    await vi.waitFor(() => expect(changes).toHaveLength(1))

    expect(event.defaultPrevented).toBe(true)
    expect(editor.getDocument().layers.map((l) => l.id)).toEqual(['rect-1', 'rect-2', 'rect-3', 'rect-4'])
    expect(editor.getSelection()).toEqual(['rect-1', 'rect-2', 'rect-4'])

    await editor.undo()
    expect(editor.getDocument()).toEqual(original)
    expect(editor.canUndo()).toBe(false)
  })

  it('does nothing when no Group is selected', async () => {
    const { editor, changes } = await openEditor(three())
    editor.select(['rect-1'])

    expect(pressGroupKey(document, { shift: true }).defaultPrevented).toBe(true)
    await settle()

    expect(changes).toEqual([])
  })
})
