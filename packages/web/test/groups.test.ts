// Groups (Document v2) are not shown by the editor yet (ticket #23). Until then a
// Document with a Group is refused with a readable message, never half shown.
import type { Layer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { applyJson } from '../src/json-apply.ts'
import { doc, openEditor, rect } from './editor-harness.ts'

const grouped = doc([rect({ id: 'rect-1' }), { id: 'group-1', type: 'group', layers: [rect({ id: 'rect-2' })] } satisfies Layer])

describe('a Document with a Group in the editor', () => {
  it('is refused on load with a readable message', async () => {
    await expect(openEditor(grouped)).rejects.toThrow(/Group "group-1".*cannot show Groups yet/)
  })

  it('is refused by apply and leaves the shown Document as it was', async () => {
    const shown = doc([rect()])
    const { editor, changes } = await openEditor(shown)

    await expect(editor.apply(grouped, { cause: 'reload' })).rejects.toThrow(/cannot show Groups yet/)

    expect(editor.getDocument()).toEqual(shown)
    expect(changes).toEqual([])
    expect(editor.canUndo()).toBe(false)
  })

  it('comes back from the JSON panel as an Issue at the Group', async () => {
    const { editor } = await openEditor(doc([rect()]))

    const result = await applyJson(editor, JSON.stringify(grouped))

    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'layers[1]', message: expect.stringMatching(/cannot show Groups yet/) }],
    })
  })
})
