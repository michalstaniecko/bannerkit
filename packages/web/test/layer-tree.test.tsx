// The Layer list as a tree (ticket #29): Groups collapse and expand, a selection made
// on the Canvas expands its ancestors, and rows of Layers inside Groups select them.
// Rendered with a real editor (jsdom + node-canvas). Drag and drop is in e2e/layers.spec.ts.
import type { GroupLayer, Layer } from '@bannerkit/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { LayerList } from '../src/LayerList.tsx'
import { doc, openEditor, rect } from './editor-harness.ts'

afterEach(cleanup)

const group = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

/** rect-1, then "Badge" (group-1: rect-2 + group-2 (rect-3)), bottom → top. */
const nested = (over: Partial<GroupLayer> = {}) =>
  doc([
    rect({ id: 'rect-1', x: 10, y: 10, width: 30, height: 30 }),
    group(
      'group-1',
      [
        rect({ id: 'rect-2', x: 100, y: 100, width: 50, height: 50 }),
        group('group-2', [rect({ id: 'rect-3', x: 200, y: 100, width: 50, height: 50 })]),
      ],
      { name: 'Badge', ...over },
    ),
  ])

async function openList(document_ = nested()) {
  const opened = await openEditor(document_)
  const user = userEvent.setup()
  const view = render(<LayerList editor={{ current: opened.editor }} loaded onError={(m) => { throw new Error(m) }} />)
  const row = (id: string) => view.container.querySelector<HTMLElement>(`[data-layer-id="${id}"]`)
  /** Shown rows top → bottom, indented two spaces per depth. */
  const rows = () =>
    [...view.container.querySelectorAll<HTMLElement>('[data-layer-id]')].map(
      (li) => '  '.repeat(Number(li.dataset.depth)) + li.dataset.layerId,
    )
  return { ...opened, user, view, row, rows }
}

describe('the Layer tree', () => {
  it('shows Groups with their Layers indented, top first, labelled by name or id', async () => {
    const { rows } = await openList()

    expect(rows()).toEqual(['group-1', '  group-2', '    rect-3', '  rect-2', 'rect-1'])
    expect(screen.getByRole('button', { name: 'Badge' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'group-2' })).toBeTruthy()
  })

  it('collapses and expands a Group; Groups start expanded', async () => {
    const { user, rows } = await openList()
    const toggle = screen.getByRole('button', { name: 'Collapse group-1' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    await user.click(toggle)
    expect(rows()).toEqual(['group-1', 'rect-1'])
    expect(screen.getByRole('button', { name: 'Expand group-1' }).getAttribute('aria-expanded')).toBe('false')

    await user.click(screen.getByRole('button', { name: 'Expand group-1' }))
    expect(rows()).toEqual(['group-1', '  group-2', '    rect-3', '  rect-2', 'rect-1'])
  })

  it('expands the ancestors of a Layer selected on the Canvas', async () => {
    const { user, editor, rows, row } = await openList()
    await user.click(screen.getByRole('button', { name: 'Collapse group-2' }))
    await user.click(screen.getByRole('button', { name: 'Collapse group-1' }))
    expect(rows()).toEqual(['group-1', 'rect-1'])

    act(() => editor.select(['rect-3']))

    expect(rows()).toEqual(['group-1', '  group-2', '    rect-3', '  rect-2', 'rect-1'])
    expect(row('rect-3')!.getAttribute('aria-selected')).toBe('true')
  })

  it('selects a Layer inside a Group by its row; Shift adds another', async () => {
    const { user, editor } = await openList()

    await user.click(screen.getByRole('button', { name: 'rect-3' }))
    expect(editor.getSelection()).toEqual(['rect-3'])

    await user.keyboard('{Shift>}')
    await user.click(screen.getByRole('button', { name: 'rect-1' }))
    await user.keyboard('{/Shift}')
    expect(editor.getSelection()).toEqual(['rect-1', 'rect-3'])
  })

  it('never selects a Group together with a Layer inside it: Shift+click swaps one for the other', async () => {
    const { user, editor } = await openList()

    await user.click(screen.getByRole('button', { name: 'Badge' }))
    await user.keyboard('{Shift>}')
    await user.click(screen.getByRole('button', { name: 'rect-3' }))
    expect(editor.getSelection()).toEqual(['rect-3'])

    await user.click(screen.getByRole('button', { name: 'Badge' }))
    await user.keyboard('{/Shift}')
    expect(editor.getSelection()).toEqual(['group-1'])
  })

  // jsdom lays nothing out, so every drop lands on a row's middle: into a Group, below a Layer.
  const drop = (from: HTMLElement, onto: HTMLElement) => {
    const dataTransfer = { setData: () => {}, getData: () => from.dataset.layerId, effectAllowed: '' }
    const target = onto.querySelector('.layer-row')!
    fireEvent.dragStart(from, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })
    fireEvent.dragEnd(from, { dataTransfer })
  }

  it('a drop is one change and one undo step', async () => {
    const { editor, changes, row, rows } = await openList()

    drop(row('rect-1')!, row('group-2')!)
    await waitFor(() => expect(rows()).toEqual(['group-1', '  group-2', '    rect-1', '    rect-3', '  rect-2']))
    expect(changes.map((c) => c.cause)).toEqual(['layers'])

    await act(() => editor.undo())
    expect(rows()).toEqual(['group-1', '  group-2', '    rect-3', '  rect-2', 'rect-1'])
    expect(editor.canUndo()).toBe(false)
  })

  it('refuses dropping a Group into its descendant: no change', async () => {
    const { changes, row, rows } = await openList()

    drop(row('group-1')!, row('group-2')!)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(changes).toEqual([])
    expect(rows()).toEqual(['group-1', '  group-2', '    rect-3', '  rect-2', 'rect-1'])
  })

  it('marks the rows inside a locked or hidden Group as inheriting it', async () => {
    const { row } = await openList(nested({ locked: true, visible: false }))

    for (const id of ['group-2', 'rect-3', 'rect-2']) {
      expect(row(id)!.dataset.inherited).toBe('hidden locked')
    }
    expect(row('group-1')!.dataset.inherited).toBeUndefined()
    expect(row('rect-1')!.dataset.inherited).toBeUndefined()
  })
})
