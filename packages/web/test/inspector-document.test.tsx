// S2: the Inspector's Properties tab with an empty Selection shows the Document: its
// name, the Canvas size with an Anchor 3×3 and the background. A new size goes
// through core `resizeCanvas` as one undo step and one `change` with cause `resize`;
// the Anchor is UI state only, kept while the Selection changes.
import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { doc, rect } from './editor-harness.ts'
import { openInspector, settle } from './inspector-harness.tsx'

const anchor = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement

describe('Properties of the Document', () => {
  it('an empty Selection shows the Document fields', async () => {
    const { field, toggle } = await openInspector(doc([rect()]))

    expect(['Name', 'Width', 'Height', 'Background'].map((name) => field(name).value)).toEqual(['hero', '400', '300', '#ffffff'])
    expect(toggle('No background').checked).toBe(false)
    expect(anchor('top-left').checked).toBe(true)
    expect(screen.getAllByRole('radio')).toHaveLength(9)
    expect(screen.queryByRole('textbox', { name: 'X' })).toBeNull()
  })

  it('a new width resizes the Canvas from the Anchor as one step with cause resize; undo puts it back', async () => {
    const original = doc([rect()])
    const { editor, user, field, changes } = await openInspector(original)

    await user.click(anchor('center'))
    await user.clear(field('Width'))
    await user.type(field('Width'), '301{Enter}')
    await settle()

    // floor(½ · (301 − 400)) = −50: Layers move, never scale.
    expect(editor.getDocument().canvas).toMatchObject({ width: 301, height: 300 })
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 50, y: 100, width: 100, height: 50 })
    expect(changes.map((c) => c.cause)).toEqual(['resize'])
    await act(() => editor.undo())
    expect(editor.getDocument()).toEqual(original)
    expect(field('Width').value).toBe('400')
  })

  it('a new height with a bottom Anchor moves the Layers down by the whole difference', async () => {
    const { editor, user, field } = await openInspector(doc([rect()]))

    await user.click(anchor('bottom-right'))
    await user.clear(field('Height'))
    await user.type(field('Height'), '350{Enter}')
    await settle()

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 100, y: 150 })
  })

  it('drops a size outside the Canvas limits', async () => {
    const { editor, user, field, changes } = await openInspector(doc([rect()]))

    await user.clear(field('Width'))
    await user.type(field('Width'), '9000{Enter}')
    await user.clear(field('Height'))
    await user.type(field('Height'), '0{Enter}')
    await settle()

    expect(editor.getDocument().canvas).toMatchObject({ width: 400, height: 300 })
    expect(changes).toEqual([])
  })

  it('renames the Document; an empty name is dropped', async () => {
    const { editor, user, field, changes } = await openInspector(doc([rect()]))

    await user.clear(field('Name'))
    await user.type(field('Name'), 'summer{Enter}')
    await settle()
    await user.clear(field('Name'))
    await user.tab()
    await settle()

    expect(editor.getDocument().name).toBe('summer')
    expect(field('Name').value).toBe('summer')
    expect(changes.map((c) => c.cause)).toEqual(['inspector'])
  })

  it('the background is a colour or transparent', async () => {
    const { editor, user, field, toggle } = await openInspector(doc([rect()]))

    await user.clear(field('Background'))
    await user.type(field('Background'), '#00ff00{Enter}')
    await settle()
    expect(editor.getDocument().canvas.background).toBe('#00ff00')

    await user.click(toggle('No background'))
    await settle()
    expect(editor.getDocument().canvas.background).toBeNull()
    expect(field('Background').disabled).toBe(true)
  })

  it('the Anchor is kept while the Selection changes and never reaches the Document', async () => {
    const { editor, user, changes } = await openInspector(doc([rect()]))

    await user.click(anchor('bottom'))
    await act(async () => editor.select(['rect-1']))
    expect(screen.queryByRole('radio')).toBeNull()
    await act(async () => editor.select([]))

    expect(anchor('bottom').checked).toBe(true)
    expect(changes).toEqual([])
    expect(JSON.stringify(editor.getDocument())).not.toContain('bottom')
  })
})
