// The left Layer list: Layers top → bottom by id. Dragging a row onto another moves it
// to that stacking position; the eye and lock toggles set visibility and lock; clicking
// a row selects its Layer (Shift adds to the selection). Every action is one undo step.
import { Eye, EyeOff, Lock, LockOpen, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode, type RefObject } from 'react'
import type { Layer } from '@bannerkit/core'
import type { Editor } from './editor/index.ts'
import { layerFlag, moveLayer, setLayerFlag } from './layer-actions.ts'
import { ICON_SIZE } from './ui/Button.tsx'
import { Panel } from './ui/Panel.tsx'
import { useLayers } from './useLayers.ts'

type Props = {
  editor: RefObject<Editor | null>
  loaded: boolean
  onError: (message: string) => void
}

export function LayerList({ editor, loaded, onError }: Props) {
  const { document, selection, run } = useLayers(editor, loaded, onError)
  const [dragged, setDragged] = useState<string | null>(null)

  const select = (id: string, add: boolean) => {
    const ids = add ? (selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]) : [id]
    editor.current?.select(ids)
  }

  return (
    <Panel label="Layers" className="layer-list">
      {document && (
        <ol>
          {[...document.layers].reverse().map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              depth={0}
              selected={selection.includes(layer.id)}
              onSelect={(add) => select(layer.id, add)}
              onFlag={(flag, value) => void run((d) => setLayerFlag(d, layer.id, flag, value))}
              drag={{
                onStart: () => setDragged(layer.id),
                canDrop: dragged !== null && dragged !== layer.id,
                onDrop: (data) => {
                  const id = dragged ?? data
                  setDragged(null)
                  if (id && id !== layer.id) void run((d) => moveLayer(d, id, layer.id))
                },
                onEnd: () => setDragged(null),
              }}
            />
          ))}
        </ol>
      )}
    </Panel>
  )
}

type RowProps = {
  layer: Layer
  /** Nesting level (0 = top level); Groups (M2) render their children one deeper. */
  depth: number
  selected: boolean
  onSelect: (add: boolean) => void
  onFlag: (flag: 'visible' | 'locked', value: boolean) => void
  drag: {
    onStart: () => void
    /** True while another row is dragged over this one. */
    canDrop: boolean
    /** Called with the dragged Layer's id. */
    onDrop: (id: string) => void
    onEnd: () => void
  }
  /** Child rows (a Group's Layers, M2), rendered as a nested list. */
  children?: ReactNode
}

/** One Layer in the list. It does not assume a flat list: `depth` indents it and `children` nest under it. */
export function LayerRow({ layer, depth, selected, onSelect, onFlag, drag, children }: RowProps) {
  return (
    <li
      data-layer-id={layer.id}
      aria-selected={selected}
      draggable
      onDragStart={(e) => {
        e.stopPropagation()
        drag.onStart()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', layer.id)
      }}
      onDragOver={(e) => {
        if (drag.canDrop) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        drag.onDrop(e.dataTransfer.getData('text/plain'))
      }}
      onDragEnd={drag.onEnd}
    >
      <div className="layer-row" style={{ ['--layer-depth' as string]: depth }}>
        <Toggle
          label={`Show ${layer.id}`}
          title="Visible"
          checked={layerFlag(layer, 'visible')}
          on={Eye}
          off={EyeOff}
          onChange={(value) => onFlag('visible', value)}
        />
        <Toggle
          label={`Lock ${layer.id}`}
          title="Locked"
          checked={layerFlag(layer, 'locked')}
          on={Lock}
          off={LockOpen}
          onChange={(value) => onFlag('locked', value)}
        />
        <button type="button" className="layer-name" onClick={(e) => onSelect(e.shiftKey)}>
          {layer.id}
        </button>
      </div>
      {children && <ol>{children}</ol>}
    </li>
  )
}

type ToggleProps = {
  label: string
  title: string
  checked: boolean
  on: LucideIcon
  off: LucideIcon
  onChange: (checked: boolean) => void
}

/** A checkbox drawn as an icon (the input sits transparent over it, so it keeps its role and label). */
function Toggle({ label, title, checked, on: On, off: Off, onChange }: ToggleProps) {
  const Icon = checked ? On : Off
  return (
    <label className="icon-toggle" title={title} data-checked={checked}>
      <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Icon size={ICON_SIZE} aria-hidden="true" />
    </label>
  )
}
