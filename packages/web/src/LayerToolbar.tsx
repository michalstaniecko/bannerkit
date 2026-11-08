// The top bar's Layer toolbar: add a text, rect or image Layer (images are picked with
// the file picker and added as Assets first) next to the Selection, delete or duplicate
// the selected Layers (a Group with everything in it), and group or ungroup them (like
// Ctrl/Cmd+G and Ctrl/Cmd+Shift+G). Each action is one undo step and leaves its result selected.
import { Copy, Group, ImagePlus, Square, Trash2, Type, Ungroup } from 'lucide-react'
import { useRef, type RefObject } from 'react'
import { api } from './api.ts'
import type { Editor } from './editor/index.ts'
import { addLayer, deleteLayers, duplicateLayers, groupSelection, ungroupSelection, type NewLayer } from './layer-actions.ts'
import { IconButton } from './ui/IconButton.tsx'
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
  const { document: shown, selection, run } = useLayers(editor, loaded, onError)
  const picker = useRef<HTMLInputElement>(null)

  const add = (specs: NewLayer[]) =>
    run((document) => {
      const select: string[] = []
      // Each next one goes right above the one added before it.
      let context = selection
      for (const spec of specs) {
        const added = addLayer(document, spec, context)
        document = added.document
        select.push(added.id)
        context = [added.id]
      }
      return { document, select }
    })

  const addAssets = async (files: File[]) => {
    if (files.length === 0) return
    try {
      const { assets } = await api.addAssets(project, files)
      await add(assets.map(({ src, width, height }) => ({ type: 'image', src, width, height })))
    } catch (e) {
      onError(`Adding Assets failed: ${(e as Error).message}`)
    }
  }

  const none = !loaded || selection.length === 0
  const canGroup = loaded && shown !== null && groupSelection(shown, selection) !== undefined
  const canUngroup = loaded && shown !== null && ungroupSelection(shown, selection) !== undefined
  return (
    <div className="toolbar-group layer-toolbar" role="group" aria-label="Layer actions">
      <IconButton icon={Type} label="Add text" disabled={!loaded} onClick={() => void add([{ type: 'text' }])} />
      <IconButton icon={Square} label="Add rect" disabled={!loaded} onClick={() => void add([{ type: 'rect' }])} />
      <IconButton icon={ImagePlus} label="Add image" disabled={!loaded} onClick={() => picker.current?.click()} />
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
          void addAssets(files)
        }}
      />
      <IconButton
        icon={Copy}
        label="Duplicate"
        disabled={none}
        onClick={() =>
          void run((d) => {
            const { document, ids } = duplicateLayers(d, selection)
            return { document, select: ids }
          })
        }
      />
      <IconButton
        icon={Group}
        label="Group"
        shortcut="Ctrl/Cmd+G"
        disabled={!canGroup}
        onClick={() => void run((d) => groupSelection(d, selection) ?? d)}
      />
      <IconButton
        icon={Ungroup}
        label="Ungroup"
        shortcut="Ctrl/Cmd+Shift+G"
        disabled={!canUngroup}
        onClick={() => void run((d) => ungroupSelection(d, selection) ?? d)}
      />
      <IconButton
        icon={Trash2}
        label="Delete"
        disabled={none}
        onClick={() => void run((d) => ({ document: deleteLayers(d, selection), select: [] }))}
      />
    </div>
  )
}
