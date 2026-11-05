// The left Layer list: Layers top → bottom by id. Dragging a row onto another moves it
// to that stacking position; the checkboxes toggle visibility and lock; clicking a row
// selects its Layer (Shift adds to the selection). Every action is one undo step.
import { useState, type RefObject } from 'react'
import type { Editor } from './editor/index.ts'
import { moveLayer, setLayerFlag } from './layer-actions.ts'
import { useLayers } from './useLayers.ts'

type Props = {
  editor: RefObject<Editor | null>
  loaded: boolean
  onError: (message: string) => void
}

export function LayerList({ editor, loaded, onError }: Props) {
  const { document, selection, run } = useLayers(editor, loaded, onError)
  const [dragged, setDragged] = useState<string | null>(null)
  if (!document) return <aside className="layer-list" aria-label="Layers" />

  const select = (id: string, add: boolean) => {
    const ids = add ? (selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]) : [id]
    editor.current?.select(ids)
  }

  return (
    <aside className="layer-list" aria-label="Layers">
      <ol>
        {[...document.layers].reverse().map((layer) => (
          <li
            key={layer.id}
            data-layer-id={layer.id}
            aria-selected={selection.includes(layer.id)}
            draggable
            onDragStart={(e) => {
              setDragged(layer.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', layer.id)
            }}
            onDragOver={(e) => {
              if (dragged && dragged !== layer.id) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const id = dragged ?? e.dataTransfer.getData('text/plain')
              setDragged(null)
              if (id && id !== layer.id) void run((d) => moveLayer(d, id, layer.id))
            }}
            onDragEnd={() => setDragged(null)}
          >
            <label title="Visible">
              <input
                type="checkbox"
                aria-label={`Show ${layer.id}`}
                checked={layer.visible !== false}
                onChange={(e) => void run((d) => setLayerFlag(d, layer.id, 'visible', e.target.checked))}
              />
            </label>
            <label title="Locked">
              <input
                type="checkbox"
                aria-label={`Lock ${layer.id}`}
                checked={layer.locked === true}
                onChange={(e) => void run((d) => setLayerFlag(d, layer.id, 'locked', e.target.checked))}
              />
            </label>
            <button type="button" className="layer-name" onClick={(e) => select(layer.id, e.shiftKey)}>
              {layer.id}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}
