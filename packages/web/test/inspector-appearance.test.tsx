// S2: the Inspector's shadow (every Layer), rect fill and corner radius, and image
// fit. Each committed change is one undo step and one `change` with cause
// `inspector`; a default value leaves the optional key out of the Document.
import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { doc, image, rect, text } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement

describe('image fit', () => {
  it('is picked from a Select: one step, one change', async () => {
    const original = doc([image()])
    const { editor, user, changes } = await openInspector(original, { select: ['image-1'] })

    expect(select('Fit').value).toBe('stretch')
    expect([...select('Fit').options].map((o) => o.value)).toEqual(['contain', 'cover', 'stretch'])
    await user.selectOptions(select('Fit'), 'cover')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(image({ fit: 'cover' }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(editor.getSelection()).toEqual(['image-1'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })
})

describe('shadow', () => {
  const shadow = { color: 'rgba(0,0,0,0.5)', blur: 8, offsetX: 0, offsetY: 4 }

  it('is off by default; switching it on adds a shadow in one step, its fields appear', async () => {
    const original = doc([text()])
    const { editor, user, toggle, field, changes } = await openInspector(original, { select: ['text-1'] })

    expect(toggle('Shadow').checked).toBe(false)
    expect(screen.queryByRole('textbox', { name: 'Blur' })).toBeNull()
    await user.click(toggle('Shadow'))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(text({ shadow }))
    expect(['Shadow color', 'Blur', 'Offset X', 'Offset Y'].map((name) => field(name).value)).toEqual(['rgba(0,0,0,0.5)', '8', '0', '4'])
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('each of color, blur, offsetX, offsetY is one step; blur stays ≥ 0', async () => {
    const { editor, user, field, changes } = await openInspector(doc([rect({ shadow })]), { select: ['rect-1'] })

    for (const [name, typed] of [['Shadow color', '#336699'], ['Blur', '-1'], ['Blur', '12'], ['Offset X', '-3'], ['Offset Y', '6']]) {
      await user.clear(field(name!))
      await user.type(field(name!), `${typed}{Enter}`)
      await settle()
    }

    expect(editor.getDocument().layers[0]).toEqual(rect({ shadow: { color: '#336699', blur: 12, offsetX: -3, offsetY: 6 } }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector', 'inspector', 'inspector'])
    expect(editor.getSelection()).toEqual(['rect-1'])
  })

  it('switching it off removes the key in one step', async () => {
    const { editor, user, toggle, changes } = await openInspector(doc([image({ shadow })]), { select: ['image-1'] })

    expect(toggle('Shadow').checked).toBe(true)
    await user.click(toggle('Shadow'))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(image())
    expect(screen.queryByRole('textbox', { name: 'Blur' })).toBeNull()
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
  })
})

describe('rect fill and corner radius', () => {
  it('a colour typed into Fill and Enter is one step; something that is not a colour is dropped', async () => {
    const original = doc([rect()])
    const { editor, user, field, changes } = await openInspector(original, { select: ['rect-1'] })

    expect(field('Fill').value).toBe('#ff0000')
    await user.clear(field('Fill'))
    await user.type(field('Fill'), 'not a colour{Enter}')
    await settle()
    expect(field('Fill').value).toBe('#ff0000')
    await user.clear(field('Fill'))
    await user.type(field('Fill'), 'rgba(0, 0, 255, 0.5){Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect({ fill: 'rgba(0, 0, 255, 0.5)' }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('dragging in the colour picker commits once, when the picker closes', async () => {
    const { editor, changes } = await openInspector(doc([rect()]), { select: ['rect-1'] })
    const picker = screen.getByLabelText('Fill picker') as HTMLInputElement

    expect(picker.value).toBe('#ff0000')
    fireEvent.input(picker, { target: { value: '#00ff00' } })
    fireEvent.input(picker, { target: { value: '#0000ff' } })
    expect(changes).toEqual([])
    fireEvent.change(picker, { target: { value: '#0000ff' } })
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect({ fill: '#0000ff' }))
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
  })

  it('a gradient fill shows as "Gradient"; a typed colour replaces it', async () => {
    const gradient = { type: 'linear' as const, angle: 90, stops: [['#000000', 0], ['#ffffff', 1]] as [string, number][] }
    const { editor, user, field } = await openInspector(doc([rect({ fill: gradient })]), { select: ['rect-1'] })

    expect(field('Fill').value).toBe('')
    expect(field('Fill').placeholder).toBe('Gradient')
    await user.type(field('Fill'), '#123456{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect({ fill: '#123456' }))
  })

  it('corner radius: a number ≥ 0, 0 leaves the key out', async () => {
    const { editor, user, field, changes } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    expect(field('Corner radius').value).toBe('0')
    await user.clear(field('Corner radius'))
    await user.type(field('Corner radius'), '-2{Enter}')
    await user.clear(field('Corner radius'))
    await user.type(field('Corner radius'), '8{Enter}')
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(rect({ cornerRadius: 8 }))
    await user.clear(field('Corner radius'))
    await user.type(field('Corner radius'), '0{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect())
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
  })
})
