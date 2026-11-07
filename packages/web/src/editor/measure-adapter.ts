// Measurement with Alt (ADR 0008): while Alt is held, the Selection is not empty, no
// gesture runs and the pointer is over the Canvas, the distances from the Selection Box
// to the box under the pointer (snapping/measure.ts) are Marks the overlay draws.
//
// The pointer's last position is kept, so the Measurement shows as soon as Alt goes
// down, without a move. It goes when Alt goes up, the window loses focus, a gesture
// starts (a press on the Canvas) or the Selection empties. The Marks are worked out
// when asked for, from the editor as it is then, so they never lag behind it.
//
// Alt keeps meaning "from the centre" when resizing: this only listens.
import type { Rect } from '@bannerkit/core'
import type { Canvas, TPointerEvent } from 'fabric'
import type { Mark } from './snapping/marks.ts'
import { measure } from './snapping/measure.ts'

export type MeasureAdapterEnv = {
  /** The Selection Box as shown now (none when the Selection is empty). */
  selectionBox: () => Rect | undefined
  /**
   * The extent of the Layer a click at `e` would select; none over the empty Canvas,
   * over a selected Layer or over one a click cannot hit (locked, hidden).
   */
  layerAt: (e: TPointerEvent) => Rect | undefined
  /** The Canvas size, measured to when no Layer is. */
  canvasSize: () => { width: number; height: number } | undefined
}

export type MeasureAdapter = {
  /** The Measurement shown now: the box measured to, then the distances (none when not measuring). */
  marks(): Mark[]
  detach(): void
}

export function attachMeasurement(canvas: Canvas, keys: Document, env: MeasureAdapterEnv): MeasureAdapter {
  let held = false
  let pointer: TPointerEvent | undefined
  let pressed = false

  const render = () => canvas.requestRenderAll()
  const release = () => {
    if (!held) return
    held = false
    render()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Alt') return
    event.preventDefault()
    if (held) return
    held = true
    render()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Alt') release()
  }
  const view = keys.defaultView
  keys.addEventListener('keydown', onKeyDown)
  keys.addEventListener('keyup', onKeyUp)
  view?.addEventListener('blur', release)

  const whileHeld = () => {
    if (held) render()
  }
  const offs = [
    canvas.on('mouse:move', ({ e }) => {
      pointer = e
      whileHeld()
    }),
    canvas.on('mouse:out', () => {
      pointer = undefined
      whileHeld()
    }),
    canvas.on('mouse:down', () => {
      pressed = true
      whileHeld()
    }),
    canvas.on('mouse:up', () => {
      pressed = false
    }),
    canvas.on('selection:cleared', whileHeld),
    canvas.on('selection:created', whileHeld),
    canvas.on('selection:updated', whileHeld),
  ]

  return {
    marks() {
      if (!held || !pointer || pressed || canvas._currentTransform) return []
      const a = env.selectionBox()
      const size = env.canvasSize()
      if (!a || !size) return []
      const b = env.layerAt(pointer) ?? { x: 0, y: 0, width: size.width, height: size.height }
      return [{ kind: 'measure-box', rect: b }, ...measure(a, b)]
    },
    detach() {
      keys.removeEventListener('keydown', onKeyDown)
      keys.removeEventListener('keyup', onKeyUp)
      view?.removeEventListener('blur', release)
      for (const off of offs) off()
    },
  }
}
