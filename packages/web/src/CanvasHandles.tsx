// The Canvas resize handles: a DOM overlay (CanvasArea's `overlay` slot) outside Fabric,
// so nothing of it reaches Render or Export. Dragging an edge keeps the opposite edge
// put, a corner the opposite corner (the Anchor), through core `resizeCanvas`. The drag
// is an editor preview (no step, no event, so the zoom holds still) with a `W × H`
// label; the release is one step with cause `resize`, Escape cancels it.
import { resizeCanvas, type Anchor, type Size } from '@bannerkit/core'
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { Editor, Preview } from './editor/index.ts'
import { canvasSide } from './editor/rounding.ts'

/** A handle: which sides it moves (-1 left/top, 1 right/bottom, 0 neither) and the Anchor it keeps. */
type Handle = { name: string; sx: -1 | 0 | 1; sy: -1 | 0 | 1; anchor: Anchor }

const HANDLES: Handle[] = [
  { name: 'top-left corner', sx: -1, sy: -1, anchor: 'bottom-right' },
  { name: 'top edge', sx: 0, sy: -1, anchor: 'bottom' },
  { name: 'top-right corner', sx: 1, sy: -1, anchor: 'bottom-left' },
  { name: 'left edge', sx: -1, sy: 0, anchor: 'right' },
  { name: 'right edge', sx: 1, sy: 0, anchor: 'left' },
  { name: 'bottom-left corner', sx: -1, sy: 1, anchor: 'top-right' },
  { name: 'bottom edge', sx: 0, sy: 1, anchor: 'top' },
  { name: 'bottom-right corner', sx: 1, sy: 1, anchor: 'top-left' },
]

type Props = { editor: RefObject<Editor | null>; loaded: boolean }

export function CanvasHandles({ editor, loaded }: Props) {
  /** The size shown while a handle is dragged (the label), null otherwise. */
  const [dragging, setDragging] = useState<Size | null>(null)
  /** Ends the gesture in progress, if any (on unmount too). */
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopRef.current?.(), [])

  if (!loaded) return null

  const start = (handle: Handle, down: ReactMouseEvent) => {
    const current = editor.current
    if (!current || down.button !== 0) return
    down.preventDefault()
    down.stopPropagation()
    stopRef.current?.()
    // The zoom is frozen for the whole gesture: no step, no `canvas` event until the release.
    const zoom = current.getZoom()
    const from = current.getDocument().canvas
    const preview: Preview = current.preview()
    const view = down.currentTarget.ownerDocument.defaultView!
    let size: Size = { width: from.width, height: from.height }
    setDragging(size)

    const move = (e: MouseEvent) => {
      // Another step (e.g. a reload from disk) ended the preview: the gesture is over.
      if (preview.ended()) return stop()
      const dx = (e.clientX - down.clientX) / zoom
      const dy = (e.clientY - down.clientY) / zoom
      size = {
        width: canvasSide(from.width + handle.sx * dx),
        height: canvasSide(from.height + handle.sy * dy),
      }
      setDragging(size)
      const shown = size
      void preview.show((d) => resizeCanvas(d, shown, handle.anchor))
    }
    const stop = () => {
      view.removeEventListener('mousemove', move)
      view.removeEventListener('mouseup', up)
      view.removeEventListener('keydown', keydown, true)
      stopRef.current = null
      setDragging(null)
    }
    const up = () => {
      stop()
      void preview.commit({ cause: 'resize' })
    }
    const keydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      stop()
      void preview.cancel()
    }
    stopRef.current = () => {
      stop()
      void preview.cancel()
    }
    view.addEventListener('mousemove', move)
    view.addEventListener('mouseup', up)
    view.addEventListener('keydown', keydown, true)
  }

  return (
    <div className="canvas-handles" data-dragging={dragging !== null || undefined}>
      {HANDLES.map((handle) => (
        <div
          key={handle.name}
          className="canvas-handle"
          data-sx={handle.sx}
          data-sy={handle.sy}
          aria-label={`Canvas handle: ${handle.name}`}
          onMouseDown={(e) => start(handle, e)}
        />
      ))}
      {dragging && (
        <output className="canvas-size-label">
          {dragging.width} × {dragging.height}
        </output>
      )}
    </div>
  )
}
