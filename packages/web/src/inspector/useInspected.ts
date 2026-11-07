// What the Inspector shows: the editor's Document and Selection, kept in step with
// its events. `reloads` counts reloads from disk, so fields can drop a value being
// typed when the Document changes under them.
import type { Document } from '@bannerkit/core'
import { useEffect, useState, type RefObject } from 'react'
import type { Editor } from '../editor/index.ts'

export function useInspected(editor: RefObject<Editor | null>, loaded: boolean) {
  const [document, setDocument] = useState<Document | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    const current = editor.current
    if (!loaded || !current) {
      setDocument(null)
      setSelection([])
      return
    }
    setDocument(current.getDocument())
    setSelection(current.getSelection())
    const offChange = current.on('change', (event) => {
      setDocument(event.document)
      if (event.cause === 'reload') setReloads((n) => n + 1)
    })
    const offSelection = current.on('selection', (event) => setSelection(event.layerIds))
    return () => {
      offChange()
      offSelection()
    }
  }, [editor, loaded])

  return { document, selection, reloads }
}
