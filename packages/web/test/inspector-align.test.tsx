// #36: the "Align" section of the Inspector: Align and Distribute of the selected
// Layers through core `alignLayers` / `distributeLayers` with the editor's measure,
// one click one undo step. Expected positions are worked out by hand below.
import type { Document, GroupLayer, Layer, MeasureText } from '@bannerkit/core'
import { act, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Inspector } from '../src/Inspector.tsx'
import { doc, openEditor, rect, text } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

const group = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

/** Every character (space included) is `size / 2` px wide, plus `letterSpacing`. */
const measure: MeasureText = (font, s, letterSpacing) => s.length * (font.size / 2 + letterSpacing)

/** rect-1 10,20 100×50 and rect-2 200,120 60×40. */
const twoRects = () => doc([rect({ id: 'rect-1', x: 10, y: 20, width: 100, height: 50 }), rect({ id: 'rect-2', x: 200, y: 120, width: 60, height: 40 })])

const alignSection = () => screen.queryByRole('region', { name: 'Align' })

describe('the Align section', () => {
  it('shows on top of Properties for a selected Layer', async () => {
    await openInspector(doc([rect()]), { select: ['rect-1'] })

    const regions = screen.getAllByRole('region')
    expect(regions[0]).toBe(alignSection())
  })

  it('shows for a selected Group', async () => {
    await openInspector(doc([group('group-1', [rect()])]), { select: ['group-1'] })

    expect(alignSection()).not.toBeNull()
  })

  it('is not there without a Selection', async () => {
    await openInspector(doc([rect()]))

    expect(alignSection()).toBeNull()
  })
})

/** The [x, y] of each root leaf of `document_`. */
const positions = (document_: Document) => document_.layers.map((l) => (l.type === 'group' ? [] : [l.x, l.y]))

describe('Align', () => {
  // rect-1 at 100,100, 100×50 on a 400×300 Canvas.
  it.each([
    ['Align left', [0, 100]],
    ['Align horizontal centers', [150, 100]],
    ['Align right', [300, 100]],
    ['Align top', [100, 0]],
    ['Align vertical centers', [100, 125]],
    ['Align bottom', [100, 250]],
  ])('%s lines one Layer up with the Canvas', async (name, position) => {
    const { editor, user } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    const button = screen.getByRole('button', { name: `${name} to Canvas` })
    expect(button.title).toBe(`${name} to Canvas`)
    await user.click(button)
    await settle()

    expect(positions(editor.getDocument())).toEqual([position])
  })

  // rect-1 10,20 100×50 and rect-2 200,120 60×40: Selection Box 10..260 × 20..160.
  it.each([
    ['Align left', [[10, 20], [10, 120]]],
    ['Align horizontal centers', [[85, 20], [105, 120]]],
    ['Align right', [[160, 20], [200, 120]]],
    ['Align top', [[10, 20], [200, 20]]],
    ['Align vertical centers', [[10, 65], [200, 70]]],
    ['Align bottom', [[10, 110], [200, 120]]],
  ])('%s lines several Layers up with their Selection Box', async (name, expected) => {
    const { editor, user } = await openInspector(twoRects(), { select: ['rect-1', 'rect-2'] })

    const button = screen.getByRole('button', { name: `${name} to Selection` })
    expect(button.title).toBe(`${name} to Selection`)
    await user.click(button)
    await settle()

    expect(positions(editor.getDocument())).toEqual(expected)
  })

  it('is one undo step and one change, and keeps the Selection', async () => {
    const original = twoRects()
    const { editor, user, changes } = await openInspector(original, { select: ['rect-1', 'rect-2'] })

    await user.click(screen.getByRole('button', { name: 'Align left to Selection' }))
    await settle()

    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(editor.getSelection()).toEqual(['rect-1', 'rect-2'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
    expect(editor.canUndo()).toBe(false)
  })

  it('moving nothing makes no step', async () => {
    const { user, changes } = await openInspector(twoRects(), { select: ['rect-1', 'rect-2'] })

    await user.click(screen.getByRole('button', { name: 'Align left to Selection' }))
    await settle()
    await user.click(screen.getByRole('button', { name: 'Align left to Selection' }))
    await settle()

    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
  })

  it('lines a rotated Layer up by its extent and keeps its rotation', async () => {
    // 100×50 at 100,100 turned 90° about its centre (150,125): extent 125..175 × 75..175.
    const { editor, user } = await openInspector(doc([rect({ rotation: 90 })]), { select: ['rect-1'] })

    await user.click(screen.getByRole('button', { name: 'Align left to Canvas' }))
    await user.click(screen.getByRole('button', { name: 'Align top to Canvas' }))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect({ rotation: 90, x: -25, y: 25 }))
  })

  it('lines a text without height up by its Text Layout height', async () => {
    // 'Summer sale' at 20 px is one 22.6 px line: its bottom at 222.6 goes to 300 by round(77.4).
    const { editor, user } = await openInspector(doc([text()]), { select: ['text-1'], measure })

    await user.click(screen.getByRole('button', { name: 'Align bottom to Canvas' }))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text({ y: 277 }))
  })

  it('moves a selected Group with all its Layers', async () => {
    // The Group's extent is 10..260 × 20..160 (centre 135); centred on the 400 px Canvas it moves by +65.
    const { editor, user } = await openInspector(doc([group('group-1', twoRects().layers)]), { select: ['group-1'] })

    await user.click(screen.getByRole('button', { name: 'Align horizontal centers to Canvas' }))
    await settle()

    expect(positions({ ...editor.getDocument(), layers: (editor.getDocument().layers[0] as GroupLayer).layers })).toEqual([
      [75, 20],
      [265, 120],
    ])
  })
})

/** a 20 px wide/tall at 0, b 40 px at 50, c 20 px at 200 along `axis`; 20 px on the other axis at 100. */
const row = (axis: 'x' | 'y', ids = ['a', 'b', 'c']) => {
  const boxes = [
    { at: 0, size: 20 },
    { at: 50, size: 40 },
    { at: 200, size: 20 },
  ]
  return doc(
    ids.map((id, i) =>
      axis === 'x'
        ? rect({ id, x: boxes[i]!.at, width: boxes[i]!.size, y: 100, height: 20 })
        : rect({ id, y: boxes[i]!.at, height: boxes[i]!.size, x: 100, width: 20 }),
    ),
  )
}

const along = (document_: Document, axis: 'x' | 'y') => document_.layers.map((l) => (l.type === 'group' ? NaN : l[axis]))

const gapField = () => screen.getByRole('textbox', { name: 'Gap' }) as HTMLInputElement

describe('Distribute', () => {
  // Span 0..220 holds 80 px of Layers: two equal gaps of 70, so b goes to 20 + 70.
  it.each([
    ['horizontally', 'x'],
    ['vertically', 'y'],
  ] as const)('%s spaces three Layers equally with an empty Gap', async (direction, axis) => {
    const original = row(axis)
    const { editor, user, changes } = await openInspector(original, { select: ['a', 'b', 'c'] })

    expect(gapField().value).toBe('')
    await user.click(screen.getByRole('button', { name: `Distribute ${direction}` }))
    await settle()

    expect(along(editor.getDocument(), axis)).toEqual([0, 90, 200])
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(editor.getSelection()).toEqual(['a', 'b', 'c'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it.each([
    ['horizontally', 'x'],
    ['vertically', 'y'],
  ] as const)('%s spaces Layers by the Gap typed in', async (direction, axis) => {
    const { editor, user } = await openInspector(row(axis), { select: ['a', 'b', 'c'] })

    await user.type(gapField(), '10{Enter}')
    await user.click(screen.getByRole('button', { name: `Distribute ${direction}` }))
    await settle()

    // a stays at 0..20; b lands at 30..70, c at 80.
    expect(along(editor.getDocument(), axis)).toEqual([0, 30, 80])
  })

  it('keeps the Gap for the session, and an emptied Gap means equal again', async () => {
    const { editor, user } = await openInspector(row('x'), { select: ['a', 'b', 'c'] })

    await user.type(gapField(), '10{Enter}')
    await act(() => editor.select(['a']))
    await act(() => editor.select(['a', 'b', 'c']))
    expect(gapField().value).toBe('10')

    await user.clear(gapField())
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Distribute horizontally' }))
    await settle()
    expect(along(editor.getDocument(), 'x')).toEqual([0, 90, 200])
  })

  it('keeps the Gap across Inspector tab switches and an empty Selection', async () => {
    const { editor } = await openEditor(row('x'))
    editor.select(['a', 'b', 'c'])
    const user = userEvent.setup()
    render(<Inspector editor={{ current: editor }} loaded anchor="top-left" onAnchorChange={() => {}} />)

    await user.type(gapField(), '10{Enter}')
    await user.click(screen.getByRole('tab', { name: 'JSON' }))
    await user.click(screen.getByRole('tab', { name: 'Properties' }))
    await act(() => editor.select([]))
    expect(alignSection()).toBeNull()
    await act(() => editor.select(['a', 'b', 'c']))
    expect(gapField().value).toBe('10')

    await user.click(screen.getByRole('button', { name: 'Distribute horizontally' }))
    await settle()
    expect(along(editor.getDocument(), 'x')).toEqual([0, 30, 80])
  })

  it('takes only a whole number of px ≥ 0 as Gap', async () => {
    const { user } = await openInspector(row('x'), { select: ['a', 'b', 'c'] })

    for (const bad of ['-5', '2.5', 'ten']) {
      await user.clear(gapField())
      await user.type(gapField(), `${bad}{Enter}`)
      expect(gapField().value).toBe('')
    }
    await user.type(gapField(), '0{Enter}')
    expect(gapField().value).toBe('0')
  })
})

const allButtons = () => [
  ...['Align left', 'Align horizontal centers', 'Align right', 'Align top', 'Align vertical centers', 'Align bottom'].map(
    (name) => screen.getByRole('button', { name: new RegExp(`^${name} to`) }) as HTMLButtonElement,
  ),
  ...distributeButtons(),
]
const distributeButtons = () =>
  ['Distribute horizontally', 'Distribute vertically'].map((name) => screen.getByRole('button', { name }) as HTMLButtonElement)
const disabled = (buttons: HTMLButtonElement[]) => buttons.map((b) => b.disabled)

describe('Inactive buttons', () => {
  it.each([
    ['locked', { locked: true }],
    ['hidden', { visible: false }],
  ])('every button is off when a selected Layer is %s', async (_, flags) => {
    const document_ = doc([rect({ id: 'a', x: 0 }), rect({ id: 'b', x: 150, ...flags }), rect({ id: 'c', x: 300 })])
    await openInspector(document_, { select: ['a', 'b', 'c'] })

    expect(disabled(allButtons())).toEqual(Array(8).fill(true))
  })

  it.each([
    ['locks', { locked: true }],
    ['hides', { visible: false }],
  ])('every button is off when a Group around a selected Layer %s it', async (_, flags) => {
    const document_ = doc([group('group-1', [rect({ id: 'a' })], flags), rect({ id: 'b', x: 250 })])
    const { editor } = await openInspector(document_)
    await act(() => editor.select(['a', 'b']))

    expect(disabled(allButtons())).toEqual(Array(8).fill(true))
  })

  it('Distribute needs three Layers with an empty Gap and two with a Gap', async () => {
    const { editor, user } = await openInspector(row('x'), { select: ['a', 'b'] })

    expect(disabled(allButtons())).toEqual([false, false, false, false, false, false, true, true])
    await user.type(gapField(), '10{Enter}')
    expect(disabled(distributeButtons())).toEqual([false, false])

    await act(() => editor.select(['a']))
    expect(disabled(distributeButtons())).toEqual([true, true])
    await user.clear(gapField())
    await user.keyboard('{Enter}')
    await act(() => editor.select(['a', 'b', 'c']))
    expect(disabled(distributeButtons())).toEqual([false, false])
  })
})
