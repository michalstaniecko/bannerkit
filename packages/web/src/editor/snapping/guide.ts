// Snapping a dragged Guide (ADR 0008): its value pulled onto the nearest edge or centre
// of an effectively visible Layer (selected and locked ones too) or of the Canvas,
// never onto another Guide. Pure TS, no Fabric or DOM.
//
// Same rules as a move: threshold 6 screen px (6 / zoom Canvas px, inclusive), the
// nearest target wins, a tie goes to the Canvas over a Layer, and the value is always
// whole px (a fractional target lands on its nearest whole px).
import type { Document, MeasureText } from '@bannerkit/core'
import type { SnapLineMark } from './marks.ts'
import { SNAP_DISTANCE } from './move.ts'
import { buildTargets, type Axis, type Targets } from './targets.ts'

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

const RANK = { guide: 0, canvas: 1, layer: 2 } as const

/** Rounding to whole px, never −0. */
const whole = (value: number) => Math.round(value) || 0

const EPSILON = 1e-6

/** Snaps a Guide on `axis` (`x`: a vertical Guide at an x) dragged to `raw` Canvas px, at `zoom`. */
export function snapGuide(targets: Targets, axis: Axis, raw: number, zoom: number): GuideSnap {
  const threshold = SNAP_DISTANCE / zoom
  const lines = targets[axis]
  let best: { distance: number; rank: number; at: number } | undefined
  for (const target of lines) {
    const distance = Math.abs(target.at - raw)
    if (distance > threshold + EPSILON) continue
    const rank = RANK[target.source]
    if (best && (distance > best.distance + EPSILON || (distance > best.distance - EPSILON && rank >= best.rank))) continue
    best = { distance, rank, at: target.at }
  }
  if (!best) return { value: whole(raw), marks: [] }
  const at = best.at
  const across = axis === 'x' ? targets.canvas.height : targets.canvas.width
  const marks = new Map<string, SnapLineMark>()
  for (const target of lines) {
    if (Math.abs(target.at - at) > EPSILON) continue
    const own = target.source === 'layer' ? { from: target.from, to: target.to } : { from: 0, to: across }
    const key = target.source
    const mark = marks.get(key)
    if (mark) {
      mark.from = Math.min(mark.from, own.from)
      mark.to = Math.max(mark.to, own.to)
    } else marks.set(key, { kind: 'snap-line', axis, at: target.at, source: target.source, ...own })
  }
  return { value: whole(at), marks: [...marks.values()] }
}
