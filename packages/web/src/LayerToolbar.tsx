// The top bar's Layer toolbar: add a text, rect or image Layer (images are picked with
// the file picker and uploaded as Assets first), and delete or duplicate the selected
// Layers. Each action is one undo step and leaves its result selected.
import { useRef, type RefObject } from 'react'
import { api } from './api.ts'
import type { Editor } from './editor/index.ts'
import { addLayer, deleteLayers, duplicateLayers, type NewLayer } from './layer-actions.ts'
import { useLayers } from './useLayers.ts'

type Props = {
  editor: RefObject<Editor | null>
  project: string
  loaded: boolean
  onError: (message: string) => void
}

/** The formats `addAssets` accepts. */
const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/svg+xml'

export function LayerToolbar({ editor, project, loaded, onError }: Props) {
  const { selection, run } = useLayers(editor, loaded, onError)
  const picker = useRef<HTMLInputElement>(null)

  const add = (specs: NewLayer[]) =>
    run((document) => {
      const select: string[] = []
      for (const spec of specs) {
        const added = addLayer(document, spec)
        document = added.document
        select.push(added.id)
      }
      return { document, select }
    })

  const upload = async (files: File[]) => {
    if (files.length === 0) return
    try {
      const { assets } = await api.uploadAssets(project, files)
      await add(assets.map(({ src, width, height }) => ({ type: 'image', src, width, height })))
    } catch (e) {
      onError(`Upload failed: ${(e as Error).message}`)
    }
  }

  const none = !loaded || selection.length === 0
  return (
    <span className="layer-toolbar">
      <button type="button" disabled={!loaded} onClick={() => void add([{ type: 'text' }])}>
        Add text
      </button>
      <button type="button" disabled={!loaded} onClick={() => void add([{ type: 'rect' }])}>
        Add rect
      </button>
      <button type="button" disabled={!loaded} onClick={() => picker.current?.click()}>
        Add image
      </button>
      <input
        ref={picker}
        type="file"
        accept={IMAGE_TYPES}
        multiple
        hidden
        aria-label="Image file"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          void upload(files)
        }}
      />
      <button type="button" disabled={none} onClick={() => void run((d) => ({ document: deleteLayers(d, selection), select: [] }))}>
        Delete
      </button>
      <button
        type="button"
        disabled={none}
        onClick={() =>
          void run((d) => {
            const { document, ids } = duplicateLayers(d, selection)
            return { document, select: ids }
          })
        }
      >
        Duplicate
      </button>
    </span>
  )
}
