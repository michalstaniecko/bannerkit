// #28: the Inspector for a Group, for a Selection holding Groups, and for a Layer that
// a locked or hidden Group around it locks or hides.
import type { Document, GroupLayer, Layer } from '@bannerkit/core'
import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { doc, rect } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

const group = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

/** group-1 "Badge" (0.8): rect-1 10,20 100×50 and rect-2 200,120 60×40. */
const badge = (over: Partial<GroupLayer> = {}) =>
  group(
    'group-1',
    [rect({ id: 'rect-1', x: 10, y: 20, width: 100, height: 50 }), rect({ id: 'rect-2', x: 200, y: 120, width: 60, height: 40 })],
    { name: 'Badge', opacity: 0.8, ...over },
  )

const childXs = (document_: Document) => (document_.layers[0] as GroupLayer).layers.map((l) => (l.type === 'group' ? NaN : l.x))

describe('Properties of a Group', () => {
  it('shows its name, Box, opacity and flags; no rotation', async () => {
    const { view, field, toggle } = await openInspector(doc([badge({ locked: true })]), { select: ['group-1'] })

    expect(view.getByLabelText('ID').textContent).toBe('group-1')
    expect(field('Name').value).toBe('Badge')
    expect([field('X').value, field('Y').value, field('Width').value, field('Height').value]).toEqual(['10', '20', '250', '140'])
    expect(field('Width').disabled).toBe(true)
    expect(field('Height').disabled).toBe(true)
    expect(field('Opacity').value).toBe('0.8')
    expect(toggle('Visible').checked).toBe(true)
    expect(toggle('Locked').checked).toBe(true)
    expect(view.queryByRole('textbox', { name: 'Rotation' })).toBeNull()
    expect(view.queryByRole('checkbox', { name: 'Shadow' })).toBeNull()
  })

  it('typing x/y moves everything in the Group by the delta, one undo step each', async () => {
    const original = doc([badge(), rect({ id: 'rect-3' })])
    const { editor, user, field, changes } = await openInspector(original, { select: ['group-1'] })

    await user.clear(field('X'))
    await user.type(field('X'), '0{Enter}')
    await user.clear(field('Y'))
    await user.type(field('Y'), '100{Enter}')
    await settle()

    const moved = editor.getDocument().layers[0] as GroupLayer
    expect(moved.layers.map((l) => (l.type === 'group' ? [] : [l.x, l.y]))).toEqual([
      [0, 100],
      [190, 200],
    ])
    expect(editor.getDocument().layers[1]).toEqual(rect({ id: 'rect-3' }))
    expect([field('X').value, field('Y').value]).toEqual(['0', '100'])
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
    expect(editor.getSelection()).toEqual(['group-1'])
    await act(() => editor.undo())
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('dragging the X label previews the move and commits one step', async () => {
    const original = doc([badge()])
    const { editor, field, changes } = await openInspector(original, { select: ['group-1'] })
    const drag = (type: 'mousedown' | 'mousemove' | 'mouseup', clientX: number) =>
      act(async () => {
        const target = type === 'mousedown' ? field('X').labels![0]! : document.body
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 10, button: 0, buttons: type === 'mouseup' ? 0 : 1 }))
        await settle()
      })

    await drag('mousedown', 50)
    await drag('mousemove', 60)
    await drag('mousemove', 75)
    expect(childXs(editor.getDocument())).toEqual([35, 225])
    expect(changes).toEqual([])
    await drag('mouseup', 75)

    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('typing a name sets it; clearing it removes the key', async () => {
    const original = doc([badge()])
    const { editor, user, field, changes } = await openInspector(original, { select: ['group-1'] })

    await user.clear(field('Name'))
    await user.type(field('Name'), 'Price{Enter}')
    await settle()
    expect((editor.getDocument().layers[0] as GroupLayer).name).toBe('Price')

    await user.clear(field('Name'))
    await user.keyboard('{Enter}')
    await settle()
    expect(editor.getDocument().layers[0]).not.toHaveProperty('name')
    expect(field('Name').value).toBe('')
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
    await act(() => editor.undo())
    expect((editor.getDocument().layers[0] as GroupLayer).name).toBe('Price')
  })

  it('opacity and flags write to the Group itself, not its children', async () => {
    const { editor, user, field, toggle } = await openInspector(doc([badge()]), { select: ['group-1'] })

    await user.clear(field('Opacity'))
    await user.type(field('Opacity'), '0.5{Enter}')
    await user.click(toggle('Visible'))
    await settle()

    const g = editor.getDocument().layers[0] as GroupLayer
    expect([g.opacity, g.visible]).toEqual([0.5, false])
    expect(g.layers).toEqual(badge().layers)
  })
})

describe('Properties of several Layers with a Group among them', () => {
  const mixed = () => doc([badge(), rect({ id: 'rect-3', x: 300, y: 250, width: 50, height: 20, opacity: 0.5 })])

  it('shows only the fields they share; a value that differs is Mixed', async () => {
    const { view, field, toggle } = await openInspector(mixed(), { select: ['group-1', 'rect-3'] })

    const shown = view.getAllByRole('textbox').map((input) => input.getAttribute('aria-label') ?? (input as HTMLInputElement).labels?.[0]?.textContent)
    // Gap belongs to the Align section on top, not to the Layers' fields.
    expect(shown).toEqual(['Gap', 'X', 'Y', 'Width', 'Height', 'Opacity'])
    expect(view.getByLabelText('ID').textContent).toBe('Mixed')
    expect(field('Opacity').placeholder).toBe('Mixed')
    expect([field('X').value, field('Y').value, field('Width').value, field('Height').value]).toEqual(['10', '20', '340', '250'])
    expect(toggle('Visible').checked).toBe(true)
    expect(toggle('Locked').checked).toBe(false)
  })

  it('typing x moves the Selection Box: every Layer in it, the Group’s children too, in one step', async () => {
    const original = mixed()
    const { editor, user, field, changes } = await openInspector(original, { select: ['group-1', 'rect-3'] })

    await user.clear(field('X'))
    await user.type(field('X'), '20{Enter}')
    await settle()

    expect(childXs(editor.getDocument())).toEqual([20, 210])
    expect(editor.getDocument().layers[1]).toMatchObject({ x: 310 })
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('a flag set on the Selection goes to each Layer, the Group itself included', async () => {
    const { editor, user, toggle } = await openInspector(mixed(), { select: ['group-1', 'rect-3'] })

    await user.click(toggle('Locked'))
    await settle()

    const [g, r] = editor.getDocument().layers
    expect([g!.locked, r!.locked]).toEqual([true, true])
    expect((g as GroupLayer).layers.map((l) => l.locked)).toEqual([undefined, undefined])
  })

  it('two Groups with different names show the name as Mixed', async () => {
    const { field } = await openInspector(doc([badge(), group('group-2', [rect({ id: 'rect-3' })], { name: 'Other' })]), {
      select: ['group-1', 'group-2'],
    })

    expect(field('Name').value).toBe('')
    expect(field('Name').placeholder).toBe('Mixed')
  })
})

describe('a Layer a Group around it locks or hides', () => {
  it('shows its own flags and that the Group locks it', async () => {
    const { view, toggle } = await openInspector(doc([badge({ locked: true })]), { select: ['rect-1'] })

    expect(toggle('Locked').checked).toBe(false)
    expect(toggle('Visible').checked).toBe(true)
    expect(view.getByRole('note').textContent).toBe('Locked by Group “Badge”')
  })

  it('names the nearest Group that hides it, by id when it has no name', async () => {
    const nested = group('group-1', [group('group-2', [rect({ id: 'rect-1' })], { visible: false }), rect({ id: 'rect-2' })], { visible: false, locked: true })
    const { view, toggle } = await openInspector(doc([nested]), { select: ['rect-1'] })

    expect(toggle('Visible').checked).toBe(true)
    expect(view.getAllByRole('note').map((n) => n.textContent)).toEqual(['Locked by Group “group-1”', 'Hidden by Group “group-2”'])
  })

  it('says nothing when only its own flag is set, or the Group lets it be', async () => {
    const { view } = await openInspector(doc([badge(), rect({ id: 'rect-3', locked: true, visible: false })]), { select: ['rect-1'] })
    expect(view.queryByRole('note')).toBeNull()
    view.unmount()

    const own = await openInspector(doc([rect({ id: 'rect-3', locked: true, visible: false })]), { select: ['rect-3'] })
    expect(own.view.queryByRole('note')).toBeNull()
  })

})
