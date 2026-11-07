// S2: the Inspector's Properties tab for one selected Layer, rendered with a real
// editor and driven by user-event. A committed field is one undo step and one
// `change` with cause `inspector`; keys typed in a field never reach the Canvas.
import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { doc, rect, text } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

describe('Properties of one Layer', () => {
  it('typing a value and Enter changes the Layer as one undo step', async () => {
    const original = doc([rect()])
    const { editor, user, field, changes } = await openInspector(original, { select: ['rect-1'] })

    await user.clear(field('X'))
    await user.type(field('X'), '120{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 120, y: 100 })
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(editor.getSelection()).toEqual(['rect-1'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
  })

  it('shows the Layer id read-only and its common fields', async () => {
    const { field, toggle } = await openInspector(doc([rect({ rotation: 15, opacity: 0.5 })]), { select: ['rect-1'] })

    expect(screen.getByLabelText('ID').textContent).toBe('rect-1')
    expect(['X', 'Y', 'Width', 'Height', 'Rotation', 'Opacity'].map((name) => field(name).value)).toEqual(['100', '100', '100', '50', '15', '0.5'])
    expect([toggle('Visible').checked, toggle('Locked').checked]).toEqual([true, false])
  })

  it('leaving the field commits; Escape puts the value back first', async () => {
    const { editor, user, field, changes } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    await user.clear(field('Y'))
    await user.type(field('Y'), '40')
    await user.tab()
    await settle()
    expect(editor.getDocument().layers[0]).toMatchObject({ y: 40 })

    await user.clear(field('Width'))
    await user.type(field('Width'), '300{Escape}')
    expect(field('Width').value).toBe('100')
    await user.tab()
    await settle()

    expect(editor.getDocument().layers[0]).toMatchObject({ y: 40, width: 100 })
    expect(changes).toHaveLength(1)
  })

  it('ArrowUp/ArrowDown step by 1, with Shift by 10, each one step and no nudge', async () => {
    const { editor, user, field, changes } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    await user.click(field('X'))
    await user.keyboard('{ArrowUp}')
    await settle()
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    await settle()

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 91, y: 100 })
    expect(field('X').value).toBe('91')
    expect(changes.map((c) => c.cause)).toEqual(['inspector', 'inspector'])
  })

  it('arrows step by the field step and stay in the schema range', async () => {
    const { editor, user, field } = await openInspector(doc([rect({ opacity: 0.95 })]), { select: ['rect-1'] })

    await user.click(field('Opacity'))
    await user.keyboard('{ArrowDown}')
    await settle()
    expect(editor.getDocument().layers[0]).toMatchObject({ opacity: 0.94 })
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}')
    await settle()

    expect(editor.getDocument().layers[0]!.opacity).toBeUndefined() // 1 is the default
  })

  it('drops a value that is not a number or is outside the schema range', async () => {
    const { editor, user, field, changes } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    for (const [name, typed] of [['X', 'abc'], ['Width', '-5'], ['Opacity', '2'], ['Y', '']] as const) {
      await user.clear(field(name))
      if (typed) await user.type(field(name), typed)
      await user.keyboard('{Enter}')
    }
    await settle()

    expect(changes).toEqual([])
    expect(['X', 'Y', 'Width', 'Opacity'].map((name) => field(name).value)).toEqual(['100', '100', '100', '1'])
  })

  it('rounds x, y, width, height to whole px and rotation to 0.1°, like a transform on the Canvas', async () => {
    const { editor, user, field } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    for (const [name, typed] of [['X', '120.6'], ['Y', '-3.4'], ['Width', '80.5'], ['Height', '33,2'], ['Rotation', '12.345'], ['Opacity', '0.555']]) {
      await user.clear(field(name!))
      await user.type(field(name!), `${typed}{Enter}`)
      await settle()
    }

    expect(editor.getDocument().layers[0]).toEqual(rect({ x: 121, y: -3, width: 81, height: 33, rotation: 12.3, opacity: 0.555 }))
  })

  it('a default value leaves the optional key out of the Document', async () => {
    const { editor, user, field, toggle } = await openInspector(doc([rect({ rotation: 15, opacity: 0.5 })]), { select: ['rect-1'] })

    await user.clear(field('Rotation'))
    await user.type(field('Rotation'), '0{Enter}')
    await user.clear(field('Opacity'))
    await user.type(field('Opacity'), '1{Enter}')
    await user.click(toggle('Visible'))
    await settle()
    expect(editor.getDocument().layers[0]).toEqual(rect({ visible: false }))
    await user.click(toggle('Visible'))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect())
  })

  it('locking or hiding the Layer keeps it selected and in the Inspector', async () => {
    const { editor, user, toggle } = await openInspector(doc([rect()]), { select: ['rect-1'] })

    await user.click(toggle('Locked'))
    await settle()

    expect(editor.getDocument().layers[0]).toEqual(rect({ locked: true }))
    expect(editor.getSelection()).toEqual(['rect-1'])
    expect(toggle('Locked').checked).toBe(true)
  })

  it('a text Layer without height shows it as Auto; typing one sets it', async () => {
    const { editor, user, field } = await openInspector(doc([text()]), { select: ['text-1'] })

    expect(field('Height').value).toBe('')
    expect(field('Height').placeholder).toBe('Auto')
    await user.type(field('Height'), '60{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toMatchObject({ height: 60 })
  })
})

describe('keys typed in a field', () => {
  it('Backspace, Delete, arrows and Cmd/Ctrl+Z edit the field, not the Document', async () => {
    const { editor, user, field, changes } = await openInspector(doc([rect()]), { select: ['rect-1'] })
    await user.clear(field('Y'))
    await user.type(field('Y'), '40{Enter}')
    await settle()
    const edited = editor.getDocument()

    await user.click(field('X'))
    await user.keyboard('{ArrowLeft}{ArrowRight}{Backspace}{Delete}{Meta>}z{/Meta}{Control>}z{/Control}')
    await settle()

    expect(editor.getDocument()).toEqual(edited)
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
    expect(editor.getSelection()).toEqual(['rect-1'])
  })
})

describe('a reload from disk during an edit', () => {
  it('drops the value being typed and shows the reloaded one', async () => {
    const { editor, user, field, changes } = await openInspector(doc([rect()]), { select: ['rect-1'] })
    await user.clear(field('X'))
    await user.type(field('X'), '250')

    await act(() => editor.update(() => doc([rect({ x: 300 })]), { cause: 'reload' }))
    expect(field('X').value).toBe('300')
    await user.tab()
    await settle()

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 300 })
    expect(changes.map((c) => c.cause)).toEqual(['reload'])
  })
})
