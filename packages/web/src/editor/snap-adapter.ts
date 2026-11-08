// The adapter between Fabric's transform events and the Snapping module (ADR 0008).
// Fabric still runs the drag (and the handles, ActiveSelection, rotation); this only
// corrects where the dragged object lands, so `object:modified → commit → change`
// stays as it was: one gesture, one `change`, one undo step.
//
// Session: `before:transform` of a drag starts one, taking the Selection Box and the
// targets from the Document as shown then (snapping/move.ts). Each `object:moving`
// sets the object's `left`/`top` to its start plus the snapped whole-px offset: a
// Layer, a Group, a Layer inside a Group (its `left`/`top` are relative to a Group
// whose transform is the identity, so the offset is the same) or an ActiveSelection.
// Cmd/Ctrl (read on every move) or Snapping turned off move freely, still on whole px.
// The session ends on `mouse:up` (after `object:modified`) or when the editor
// abandons the gesture (`end`); its Marks go with it.
import type { Document, MeasureText } from '@bannerkit/core'
import { ActiveSelection, type Canvas, type FabricObject } from 'fabric'
import type { Mark } from './snapping/marks.ts'
import { freeMove, snapMove, startMove, type MoveStart } from './snapping/move.ts'
import { createSnapSession } from './snap-session.ts'

export type SnapAdapterEnv = {
  /** The Document as shown now. */
  document: () => Document
  /** The ids of the Layers `objects` show (unknown objects left out). */
  idsOf: (objects: readonly FabricObject[]) => string[]
  measure: () => MeasureText
  zoom: () => number
}

export type SnapAdapter = {
  /** The Marks of the drag running now (none outside a drag). */
  marks(): readonly Mark[]
  /** Turns Snapping on or off for the next moves (a drag still lands on whole px). */
  setEnabled(on: boolean): void
  /** Ends the session running, if any (the gesture was abandoned). */
  end(): void
  detach(): void
}

type Session = { target: FabricObject; left: number; top: number; start: MoveStart; marks: readonly Mark[] }

export function attachSnapAdapter(canvas: Canvas, env: SnapAdapterEnv): SnapAdapter {
  const sessions = createSnapSession<Session>(canvas)

  const offs = [
    canvas.on('before:transform', ({ transform }) => {
      sessions.start(undefined)
      if (transform.action !== 'drag') return
      const target = transform.target
      const ids = env.idsOf(target instanceof ActiveSelection ? target.getObjects() : [target])
      const start = ids.length > 0 ? startMove(env.document(), ids, env.measure()) : undefined
      if (start) sessions.start({ target, left: target.left, top: target.top, start, marks: [] })
    }),
    canvas.on('object:moving', ({ target, e }) => {
      const session = sessions.current()
      if (!session || session.target !== target) return
      const raw = { x: target.left - session.left, y: target.top - session.top }
      const free = !sessions.enabled() || e.metaKey || e.ctrlKey
      const { offset, marks } = free ? freeMove(raw) : snapMove(session.start, raw, env.zoom())
      // An axis Fabric keeps still stays still.
      const still = { x: target.lockMovementX, y: target.lockMovementY }
      session.marks = marks.filter((m) => !('axis' in m && still[m.axis]))
      target.set({ left: session.left + (still.x ? 0 : offset.x), top: session.top + (still.y ? 0 : offset.y) })
      target.setCoords()
    }),
  ]

  return sessions.controls(offs)
}
