// How the Inspector changes the Document: `commit` is one `editor.update` with cause
// `inspector` (or the one given, e.g. `resize`), unless a gesture (a label drag) is previewing, in which case it ends that
// preview as the one step. `preview` shows a recipe without a step; `cancel` drops it.
import { useRef, type RefObject } from 'react'
import type { ApplyCause, DocumentRecipe, Editor, Preview } from '../editor/index.ts'

export type Edits = ReturnType<typeof useEdits>

export function useEdits(editor: RefObject<Editor | null>) {
  const running = useRef<Preview | null>(null)

  /** The preview of the gesture in progress, if it has not ended (e.g. dropped by a reload). */
  const active = () => {
    const preview = running.current
    return preview && !preview.ended() ? preview : null
  }

  return {
    preview(recipe: DocumentRecipe) {
      const current = editor.current
      if (!current) return
      const preview = active() ?? (running.current = current.preview())
      void preview.show(recipe)
    },
    commit(recipe: DocumentRecipe, cause: ApplyCause = 'inspector') {
      const preview = active()
      running.current = null
      if (!preview) return void editor.current?.update(recipe, { cause })
      void preview.show(recipe)
      void preview.commit({ cause })
    },
    cancel() {
      void active()?.cancel()
      running.current = null
    },
  }
}
