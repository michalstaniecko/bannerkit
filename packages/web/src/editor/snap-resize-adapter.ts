// The adapter between Fabric's resize and rotate handles and the Snapping module
// (ADR 0008). Fabric still runs the transform; this only corrects where it lands, so
// `object:modified → commit → change` stays as it was: one gesture, one `change`.
//
// Resize: `before:transform` of a scale (rect, image) or a text resize starts a session
// for one unrotated leaf Layer (snapping/resize.ts); a Group, several Layers and a
// rotated Layer scale without snapping. A rect or an image is corrected on each
// `object:scaling` (its scale and position, so its Box, not its picture, lands on the
// snapped edge); a text Layer through `snapText`, before the editor resizes it.
// Cmd/Ctrl (read on every move) or Snapping turned off resize freely.
//
// Rotate: with Shift held, the rotation handle turns by 15° steps (Fabric's `snapAngle`
// for the move). A Group's and a Selection's angle starts at 0, so their step is
// relative. Neither Snapping turned off nor Cmd/Ctrl stops it.
import type { Document, MeasureText, Rect } from '@bannerkit/core'
import { ActiveSelection, Group, type Canvas, type FabricObject, type TPointerEvent, type Transform, type TransformActionHandler } from 'fabric'
import type { Mark } from './snapping/marks.ts'
import { snapResize, startResize, type ResizeHandle, type ResizeStart } from './snapping/resize.ts'
import { createSnapSession } from './snap-session.ts'

export type ResizeSnapEnv = {
  /** The Document as shown now. */
  document: () => Document
  /** The ids of the Layers `objects` show (unknown objects left out). */
  idsOf: (objects: readonly FabricObject[]) => string[]
  /** The Box (Canvas px) of the leaf Layer `object` shows now. */
  boxOf: (object: FabricObject) => Rect | undefined
  measure: () => MeasureText
  zoom: () => number
}

export type ResizeSnap = {
  /** The Marks of the resize running now (none outside one). */
  marks(): readonly Mark[]
  /** Turns resize snapping on or off for the next moves (the 15° rotation stays). */
  setEnabled(on: boolean): void
  /**
   * The raw Box `box` of the text Layer `target` (its handle moved by the pointer of
   * `e`) as it snaps; `box` itself when it does not.
   */
  snapText(target: FabricObject, box: Rect, e: TPointerEvent): Rect
  /** Ends the session running, if any (the gesture was abandoned). */
  end(): void
  detach(): void
}

/** The angle step of a rotation with Shift held, in degrees. */
export const ROTATION_STEP = 15

type Session = { target: FabricObject; start: ResizeStart; corner: string; marks: readonly Mark[] }

const SCALE_ACTIONS = new Set(['scale', 'scaleX', 'scaleY', 'resizing'])

export function attachResizeSnap(canvas: Canvas, env: ResizeSnapEnv): ResizeSnap {
  const sessions = createSnapSession<Session>(canvas)

  /** Snaps `box` of the session's target for a move with the pointer event `e`. */
  const snap = (transform: Transform | undefined, box: Rect, e: TPointerEvent): Rect => {
    const session = sessions.current()
    if (!session) return box
    if (!sessions.enabled() || e.metaKey || e.ctrlKey) {
      session.marks = []
      return box
    }
    const result = snapResize(session.start, box, handleOf(canvas, session.corner, transform, e), env.zoom())
    session.marks = result.marks
    return result.box
  }

  const offs = [
    canvas.on('before:transform', ({ transform }) => {
      sessions.start(undefined)
      if (transform.action === 'rotate') transform.actionHandler = stepWithShift(transform.actionHandler)
      if (!SCALE_ACTIONS.has(transform.action ?? '')) return
      const target = transform.target
      if (target instanceof ActiveSelection || target instanceof Group) return
      const ids = env.idsOf([target])
      const start = ids.length === 1 ? startResize(env.document(), ids[0]!, env.measure()) : undefined
      if (start) sessions.start({ target, start, corner: transform.corner, marks: [] })
    }),
    canvas.on('object:scaling', ({ target, e, transform }) => {
      const session = sessions.current()
      if (!session || session.target !== target) return
      const raw = env.boxOf(target)
      if (!raw) return
      const box = snap(transform, raw, e)
      if (box === raw) return
      // Scale so the Box gets the snapped size, then move it onto the snapped place.
      target.set({
        scaleX: raw.width > 0 ? (target.scaleX * box.width) / raw.width : target.scaleX,
        scaleY: raw.height > 0 ? (target.scaleY * box.height) / raw.height : target.scaleY,
      })
      const scaled = env.boxOf(target) ?? box
      target.set({ left: target.left + box.x - scaled.x, top: target.top + box.y - scaled.y })
      target.setCoords()
    }),
  ]

  return {
    ...sessions.controls(offs),
    snapText(target, box, e) {
      const session = sessions.current()
      if (!session || session.target !== target) return box
      return snap(undefined, box, e)
    },
  }
}

/**
 * The handle `corner` as the Snapping module reads it: the Box edges it moves, whether
 * a corner keeps the proportion (Fabric's uniform scaling, flipped by its key, Shift)
 * and whether Fabric resizes from the centre (Alt at the start of the transform).
 */
function handleOf(canvas: Canvas, corner: string, transform: Transform | undefined, e: TPointerEvent): ResizeHandle {
  const x = corner.includes('l') ? 'start' : corner.includes('r') ? 'end' : undefined
  const y = corner.includes('t') ? 'start' : corner.includes('b') ? 'end' : undefined
  const keyHeld = Boolean(canvas.uniScaleKey && e[canvas.uniScaleKey])
  const proportional = Boolean(x && y) && canvas.uniformScaling !== keyHeld
  const centred = transform?.originX === 'center' && transform.originY === 'center'
  return { ...(x && { x }), ...(y && { y }), proportional, centred }
}

/** The rotation handle's action, turning by `ROTATION_STEP` while Shift is held. */
function stepWithShift(handler: TransformActionHandler | undefined): TransformActionHandler | undefined {
  if (!handler) return handler
  return (event, transform, x, y) => {
    if (!event.shiftKey) return handler(event, transform, x, y)
    const target = transform.target
    const { snapAngle, snapThreshold } = target
    target.snapAngle = ROTATION_STEP
    target.snapThreshold = ROTATION_STEP / 2
    try {
      return handler(event, transform, x, y)
    } finally {
      target.snapAngle = snapAngle
      target.snapThreshold = snapThreshold
    }
  }
}
