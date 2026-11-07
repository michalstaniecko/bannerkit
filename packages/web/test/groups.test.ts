// Groups (Document v2) in the editor: shown as one Fabric object per Group with its
// children inside, selected and moved as a whole (ticket #23).
import type { GroupLayer, Layer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { doc, openEditor, rect, text } from './editor-harness.ts'

const group = (id: string, layers: Layer[], over: Partial<GroupLayer> = {}): GroupLayer => ({ id, type: 'group', layers, ...over })

/** rect-1 at the root, then group-1 (rect-2 + group-2 (text-1 rotated)) with opacity. */
const nested = () =>
  doc([
    rect({ id: 'rect-1', x: 10, y: 10, width: 30, height: 30 }),
    group(
      'group-1',
      [
        rect({ id: 'rect-2', x: 100, y: 100, width: 100, height: 50, fill: '#00ff00' }),
        group('group-2', [text({ id: 'text-1', x: 150.5, y: 130, width: 120, rotation: 12 })], { name: 'Inner', locked: false }),
      ],
      { name: 'Badge', opacity: 0.5 },
    ),
  ])

describe('a Document with Groups in the editor', () => {
  it('opens and comes back unchanged from getDocument', async () => {
    const shown = nested()
    const { editor } = await openEditor(shown)

    expect(editor.getDocument()).toEqual(shown)
    expect(JSON.stringify(editor.getDocument())).toBe(JSON.stringify(shown))
  })
})
