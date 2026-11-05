// Shared by the Layer list and the Layer toolbar: the shown Document's Layers and the
// Selection, kept in step with the editor's events, and `run`, which applies one Layer
// action (layer-actions.ts) as exactly one undo step and then selects its result.
import type { Document } from '@bannerkit/core'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { Editor } from './editor/index.ts'

export type LayerAction = (document: Document) => Document | { document: Document; select: string[] }

export function useLayers(editor: RefObject<Editor | null>, loaded: boolean, onError: (message: string) => void) {
  const [document, setDocument] = useState<Document | null>(null)
  const [selection, setSelection] = useState<string[]>([])

  useEffect(() => {
    const current = editor.current
    if (!loaded || !current) {
      setDocument(null)
      setSelection([])
      return
    }
    setDocument(current.getDocument())
    setSelection(current.getSelection())
    const offChange = current.on('change', (event) => setDocument(event.document))
    const offSelection = current.on('selection', (event) => setSelection(event.layerIds))
    return () => {
      offChange()
      offSelection()
    }
  }, [editor, loaded])

  const run = useCallback(
    async (action: LayerAction) => {
      const current = editor.current
      if (!current) return
      try {
        const result = action(current.getDocument())
        const { document: next, select } = 'select' in result ? result : { document: result, select: undefined }
        const kept = current.getSelection()
        await current.apply(next, { cause: 'layers' })
        // `apply` lays the Document out again, which clears the Canvas selection.
        current.select(select ?? kept)
      } catch (e) {
        onError((e as Error).message)
      }
    },
    [editor, onError],
  )

  return { document, selection, run }
}
