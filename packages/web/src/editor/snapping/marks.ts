// What the precision tools draw over the Canvas (on Fabric's `contextTop`, never in a
// Render or an Export), in Canvas coordinates. A tagged union on `kind`: each tool adds
// its own kind (equal gaps, Measurement, …) and a case in the overlay's drawing.
import type { Rect } from '@bannerkit/core'
import type { Axis, TargetSource } from './targets.ts'

/**
 * A snap line: the moved Selection Box lines up with a target at `at` on `axis` (`x`:
 * a vertical line at x = `at`, running from y = `from` to `to`; `y`: horizontal).
 * For a Layer it runs from the moved box to the farthest Layer matched there; for the
 * Canvas across the whole Canvas; for a Guide it is the Guide's own line across the Canvas.
 */
export type SnapLineMark = { kind: 'snap-line'; axis: Axis; at: number; from: number; to: number; source: TargetSource }

export type Mark = SnapLineMark | MeasureMark | MeasureBoxMark

/**
 * A Measurement distance on `axis` (`x`: horizontal, from x = `from` to `to`, drawn at
 * y = `at`; `y`: vertical), labelled in px. `extension`: a dashed line across the other
 * axis (for `x`, vertical at x = `extension.at`, from y = `extension.from` to `to`) that
 * carries the distance on to the measured box when the two share nothing on that axis.
 */
export type MeasureMark = {
  kind: 'measure'
  axis: Axis
  at: number
  from: number
  to: number
  label: string
  extension?: { at: number; from: number; to: number }
}

/** The outline of the box measured to (a Layer's extent or the Canvas), highlighted. */
export type MeasureBoxMark = { kind: 'measure-box'; rect: Rect }
