// The session lifecycle the Snapping adapters share (snap-adapter.ts, snap-resize-adapter.ts):
// at most one session at a time, its Marks shown while it runs, ended on `mouse:up` or
// when the editor abandons the gesture (a redraw only when it had Marks to take away),
// and an on/off switch for Snapping.
import type { Canvas } from 'fabric'
import type { Mark } from './snapping/marks.ts'

export type SnapSession<S extends { marks: readonly Mark[] }> = {
  /** The session running, if any. */
  current(): S | undefined
  /** Starts `session` (none: no session for this gesture), replacing any running one. */
  start(session: S | undefined): void
  /** Whether Snapping is on. */
  enabled(): boolean
  /** The methods every Snapping adapter has; `detach` also removes `offs` (the adapter's own listeners). */
  controls(offs: readonly (() => void)[]): {
    marks(): readonly Mark[]
    setEnabled(on: boolean): void
    end(): void
    detach(): void
  }
}

export function createSnapSession<S extends { marks: readonly Mark[] }>(canvas: Canvas): SnapSession<S> {
  let enabled = true
  let session: S | undefined

  const end = () => {
    if (!session) return
    const hadMarks = session.marks.length > 0
    session = undefined
    if (hadMarks) canvas.requestRenderAll()
  }
  const offUp = canvas.on('mouse:up', end)

  return {
    current: () => session,
    start(next) {
      session = next
    },
    enabled: () => enabled,
    controls: (offs) => ({
      marks: () => session?.marks ?? [],
      setEnabled(on) {
        enabled = on
      },
      end,
      detach() {
        for (const off of [...offs, offUp]) off()
        session = undefined
      },
    }),
  }
}
