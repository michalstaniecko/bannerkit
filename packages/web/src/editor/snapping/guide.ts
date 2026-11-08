// Snapping a dragged Guide (ADR 0008): its value pulled onto the nearest edge or centre
// of an effectively visible Layer (selected and locked ones too) or of the Canvas,
// never onto another Guide. Pure TS, no Fabric or DOM.
//
// Same rules as a move: threshold 6 screen px (6 / zoom Canvas px, inclusive), the
// nearest target wins, a tie goes to the Canvas over a Layer, and the value is always
// whole px (a fractional target lands on its nearest whole px).
import type { Document, MeasureText } from '@bannerkit/core'
import type { SnapLineMark } from './marks.ts'
import { buildTargets, EPSILON, mergeSnapLines, nearestTarget, RANK, SNAP_DISTANCE, whole, type Axis, type Targets } from './targets.ts'

export type GuideSnap = {
  /** The whole-px value the Guide lands on. */
  value: number
  /** A snap line per target lined up with the value. */
  marks: SnapLineMark[]
}

/** The targets a Guide snaps to in `document`: every Layer and the Canvas, no Guides. Built once per gesture. */
export function guideTargets(document: Document, measure: MeasureText): Targets {
  const targets = buildTargets(document, [], measure)
  return { ...targets, x: targets.x.filter((t) => t.source !== 'guide'), y: targets.y.filter((t) => t.source !== 'guide') }
}

/** Snaps a Guide on `axis` (`x`: a vertical Guide at an x) dragged to `raw` Canvas px, at `zoom`. */
export function snapGuide(targets: Targets, axis: Axis, raw: number, zoom: number): GuideSnap {
  const lines = targets[axis]
  const best = nearestTarget(
    lines.map((target) => ({ at: target.at, distance: Math.abs(target.at - raw), rank: RANK[target.source] })),
    SNAP_DISTANCE / zoom,
  )
  if (!best) return { value: whole(raw), marks: [] }
  const matched = lines.filter((target) => Math.abs(target.at - best.at) <= EPSILON)
  return { value: whole(best.at), marks: mergeSnapLines(axis, matched, targets.canvas) }
}
