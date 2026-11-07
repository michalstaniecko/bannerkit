// The Layer toolbar with Groups (#25): Group / Ungroup buttons enabled under the same
// conditions as Cmd+G / Cmd+Shift+G, duplicate and delete of a Group, and adding a
// Layer next to the Selection. Every action is one `change` and one undo step.
import type { Document, Layer } from '@bannerkit/core'
import { act, cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { LayerToolbar } from '../src/LayerToolbar.tsx'
import { doc, openEditor, rect } from './editor-harness.ts'
import { settle } from './inspector-harness.tsx'

afterEach(cleanup)

const badge = (): Layer => ({ id: 'group-1', type: 'group', layers: [rect({ id: 'rect-2', x: 0 }), rect({ id: 'rect-3', x: 120 })] })
const tree = () => doc([rect({ id: 'rect-1', x: 240 }), badge()])

async function openToolbar(document_: Document, select: string[]) {
  const opened = await openEditor(document_)
  render(<LayerToolbar editor={{ current: opened.editor }} project="demo" loaded onError={(m) => expect.fail(m)} />)
  await act(async () => {
    opened.editor.select(select)
    await settle()
  })
  const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
  const press = async (name: string) => {
    await userEvent.click(button(name))
    await act(settle)
  }
  return { ...opened, button, press }
}

const ids = (layers: readonly Layer[]): unknown[] => layers.map((l) => (l.type === 'group' ? { [l.id]: ids(l.layers) } : l.id))

describe('Group and Ungroup buttons', () => {
  it('group the Selection, then ungroup it, one undo step each', async () => {
    const original = doc([rect({ id: 'rect-1' }), rect({ id: 'rect-2', x: 200 })])
    const { editor, changes, button, press } = await openToolbar(original, ['rect-1', 'rect-2'])
    expect(button('Ungroup').disabled).toBe(true)

    await press('Group')
    expect(ids(editor.getDocument().layers)).toEqual([{ 'group-1': ['rect-1', 'rect-2'] }])
    expect(editor.getSelection()).toEqual(['group-1'])
    expect(button('Ungroup').disabled).toBe(false)

    await press('Ungroup')
    expect(editor.getDocument()).toEqual(original)
    expect(editor.getSelection()).toEqual(['rect-1', 'rect-2'])
    expect(changes.map((c) => c.cause)).toEqual(['layers', 'layers'])

    await act(() => editor.undo())
    expect(ids(editor.getDocument().layers)).toEqual([{ 'group-1': ['rect-1', 'rect-2'] }])
  })

  it('are disabled for Layers of different parents, or without a Selection', async () => {
    const { editor, button } = await openToolbar(tree(), ['rect-1', 'rect-2'])
    expect(button('Group').disabled).toBe(true)
    expect(button('Ungroup').disabled).toBe(true)

    await act(async () => {
      editor.select([])
      await settle()
    })
    expect(button('Group').disabled).toBe(true)
  })
})

describe('Duplicate and Delete with a Group', () => {
  it('duplicate copies the whole Group with new ids, one undo step', async () => {
    const { editor, changes, press } = await openToolbar(tree(), ['group-1'])

    await press('Duplicate')

    expect(ids(editor.getDocument().layers)).toEqual(['rect-1', { 'group-1': ['rect-2', 'rect-3'] }, { 'group-2': ['rect-4', 'rect-5'] }])
    expect(editor.getSelection()).toEqual(['group-2'])
    expect(changes).toHaveLength(1)
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(tree())
  })

  it('delete removes the whole Group, one undo step', async () => {
    const { editor, changes, press } = await openToolbar(tree(), ['group-1'])

    await press('Delete')

    expect(ids(editor.getDocument().layers)).toEqual(['rect-1'])
    expect(changes.map((c) => c.layerIds.sort())).toEqual([['group-1', 'rect-2', 'rect-3']])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(tree())
  })

  it('deleting the last children of a Group removes the Group too', async () => {
    const { editor, press } = await openToolbar(tree(), ['rect-2', 'rect-3'])

    await press('Delete')

    expect(ids(editor.getDocument().layers)).toEqual(['rect-1'])
  })
})

describe('Adding a Layer', () => {
  it('next to a selected child goes into its Group, right above it, and is selected', async () => {
    const { editor, changes, press } = await openToolbar(tree(), ['rect-2'])

    await press('Add rect')

    expect(ids(editor.getDocument().layers)).toEqual(['rect-1', { 'group-1': ['rect-2', 'rect-4', 'rect-3'] }])
    expect(editor.getSelection()).toEqual(['rect-4'])
    expect(changes).toHaveLength(1)
  })

  it('with a Group selected goes right above it', async () => {
    const { editor, press } = await openToolbar(doc([badge(), rect({ id: 'rect-1' })]), ['group-1'])

    await press('Add text')

    expect(ids(editor.getDocument().layers)).toEqual([{ 'group-1': ['rect-2', 'rect-3'] }, 'text-1', 'rect-1'])
  })
})
