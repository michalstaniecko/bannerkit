// The left Layer list: a tree of Layers, top → bottom, each row labelled by its `name`
// or id. A Group row collapses its Layers (UI state for the session; Groups start
// expanded), and a selection made on the Canvas expands the selected Layers' ancestors.
// Clicking a row selects its Layer (Shift adds; a Group is never selected together
// with a Layer inside it). The eye and lock toggles set visibility and lock; rows inside
// a hidden or locked Group are marked as inheriting it. Dragging a row onto the top or
// bottom of another puts its Layer above or below that one in its parent; onto the
// middle of a Group row, on top of the Group's Layers. Every action is one undo step.
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, LockOpen, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import { ancestorsOf, inheritedFlags, type Document, type Layer } from '@bannerkit/core'
import type { Editor } from './editor/index.ts'
import { toggleRelated } from './editor/picking.ts'
import { dropLayer, layerFlag, setLayerFlag, type DropPosition } from './layer-actions.ts'
import { ICON_SIZE } from './ui/Button.tsx'
import { Panel } from './ui/Panel.tsx'
import { useLayers } from './useLayers.ts'

type Props = {
  editor: RefObject<Editor | null>
  loaded: boolean
  onError: (message: string) => void
}

/** Where a drag is over the list: the row and the part of it. */
type DropTarget = { id: string; position: DropPosition }

/** Which flags a row inherits from its ancestors. */
type Inherited = { hidden: boolean; locked: boolean }

export function LayerList({ editor, loaded, onError }: Props) {
  const { document, selection, run } = useLayers(editor, loaded, onError)
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<DropTarget | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  // A Layer selected on the Canvas is shown: its ancestors expand.
  useEffect(() => {
    if (!document) return
    const shown = new Set(selection.flatMap((id) => ancestorsOf(document, id).map((g) => g.id)))
    setCollapsed((c) => ([...c].some((id) => shown.has(id)) ? new Set([...c].filter((id) => !shown.has(id))) : c))
  }, [document, selection])

  const select = (id: string, add: boolean) => {
    if (document) editor.current?.select(add ? toggleSelected(document, selection, id) : [id])
  }

  const toggleCollapsed = (id: string) =>
    setCollapsed((c) => (c.has(id) ? new Set([...c].filter((g) => g !== id)) : new Set([...c, id])))

  const endDrag = () => {
    setDragged(null)
    setOver(null)
  }

  const rows = (doc: Document, layers: readonly Layer[], depth: number): ReactNode =>
    [...layers].reverse().map((layer) => {
      const isGroup = layer.type === 'group'
      const expanded = isGroup && !collapsed.has(layer.id)
      const flags = inheritedFlags(doc, layer.id)
      const inherited: Inherited = { hidden: flags?.hiddenBy !== undefined, locked: flags?.lockedBy !== undefined }
      return (
        <LayerRow
          key={layer.id}
          layer={layer}
          depth={depth}
          selected={selection.includes(layer.id)}
          inherited={inherited}
          expanded={isGroup ? expanded : undefined}
          onToggleExpanded={() => toggleCollapsed(layer.id)}
          onSelect={(add) => select(layer.id, add)}
          onFlag={(flag, value) => void run((d) => setLayerFlag(d, layer.id, flag, value))}
          drag={{
            onStart: () => setDragged(layer.id),
            onOver: (position) => {
              const id = dragged
              const ok = id !== null && document !== null && dropLayer(document, id, layer.id, position).ok
              setOver(ok ? { id: layer.id, position } : null)
              return ok
            },
            dropping: over?.id === layer.id ? over.position : undefined,
            onDrop: (data, position) => {
              const id = dragged ?? data
              endDrag()
              const current = editor.current
              if (!id || !current) return
              // A refused drop changes nothing: no `change`, no undo step.
              const result = dropLayer(current.getDocument(), id, layer.id, position)
              if (result.ok) void run(() => result.document)
            },
            onLeave: () => setOver(null),
            onEnd: endDrag,
          }}
        >
          {expanded && rows(doc, layer.layers, depth + 1)}
        </LayerRow>
      )
    })

  return (
    <Panel label="Layers" className="layer-list">
      {document && <ol>{rows(document, document.layers, 0)}</ol>}
    </Panel>
  )
}

/**
 * The selection after Shift+clicking `id`: it leaves the selection if it was in it, else
 * it joins it in place of its selected ancestors and descendants (never both a Group and
 * a Layer inside it).
 */
export function toggleSelected(document: Document, selection: readonly string[], id: string): string[] {
  return toggleRelated(selection, id, (ancestor, item) => ancestorsOf(document, item).some((g) => g.id === ancestor))
}

type RowProps = {
  layer: Layer
  /** Nesting level (0 = top level); a Group's Layers are one deeper. */
  depth: number
  selected: boolean
  /** Hidden or locked through an ancestor Group. */
  inherited: Inherited
  /** For a Group: whether its Layers are shown. */
  expanded: boolean | undefined
  onToggleExpanded: () => void
  onSelect: (add: boolean) => void
  onFlag: (flag: 'visible' | 'locked', value: boolean) => void
  drag: {
    onStart: () => void
    /** A row is dragged over `position` of this one; answers whether it may be dropped there. */
    onOver: (position: DropPosition) => boolean
    /** Where a drop would go while a row is dragged over this one. */
    dropping: DropPosition | undefined
    /** Called with the dragged Layer's id. */
    onDrop: (id: string, position: DropPosition) => void
    onLeave: () => void
    onEnd: () => void
  }
  /** Child rows (a Group's Layers), rendered as a nested list. */
  children?: ReactNode
}

/** The part of a row the pointer is over: a Group's middle half drops into it. */
function dropPosition(e: DragEvent<HTMLElement>, group: boolean): DropPosition {
  const { top, height } = e.currentTarget.getBoundingClientRect()
  const share = height > 0 ? (e.clientY - top) / height : 0.5
  if (group) return share < 0.25 ? 'above' : share > 0.75 ? 'below' : 'into'
  return share < 0.5 ? 'above' : 'below'
}

/** One Layer in the list: `depth` indents it and `children` nest under it. */
export function LayerRow(props: RowProps) {
  const { layer, depth, selected, inherited, expanded, onToggleExpanded, onSelect, onFlag, drag, children } = props
  const marks = [inherited.hidden && 'hidden', inherited.locked && 'locked'].filter(Boolean).join(' ')
  const group = layer.type === 'group'
  return (
    <li
      data-layer-id={layer.id}
      data-depth={depth}
      data-inherited={marks || undefined}
      aria-selected={selected}
      draggable
      onDragStart={(e) => {
        e.stopPropagation()
        drag.onStart()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', layer.id)
      }}
      onDragEnd={(e) => {
        e.stopPropagation()
        drag.onEnd()
      }}
    >
      <div
        className="layer-row"
        data-drop={drag.dropping}
        style={{ ['--layer-depth' as string]: depth }}
        onDragOver={(e) => {
          if (drag.onOver(dropPosition(e, group))) e.preventDefault()
        }}
        onDragLeave={drag.onLeave}
        onDrop={(e) => {
          e.preventDefault()
          drag.onDrop(e.dataTransfer.getData('text/plain'), dropPosition(e, group))
        }}
      >
        {expanded === undefined ? (
          <span className="layer-expand" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="layer-expand"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${layer.id}`}
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? <ChevronDown size={ICON_SIZE} aria-hidden="true" /> : <ChevronRight size={ICON_SIZE} aria-hidden="true" />}
          </button>
        )}
        <Toggle
          label={`Show ${layer.id}`}
          title={inherited.hidden ? 'Visible (its Group is hidden)' : 'Visible'}
          checked={layerFlag(layer, 'visible')}
          on={Eye}
          off={EyeOff}
          onChange={(value) => onFlag('visible', value)}
        />
        <Toggle
          label={`Lock ${layer.id}`}
          title={inherited.locked ? 'Locked (its Group is locked)' : 'Locked'}
          checked={layerFlag(layer, 'locked')}
          on={Lock}
          off={LockOpen}
          onChange={(value) => onFlag('locked', value)}
        />
        <button type="button" className="layer-name" onClick={(e) => onSelect(e.shiftKey)}>
          {(group && layer.name) || layer.id}
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
