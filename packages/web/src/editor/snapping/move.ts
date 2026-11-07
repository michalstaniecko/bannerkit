// Snapping a drag (ADR 0008): the Selection Box from the start of the gesture, moved by
// the pointer's offset, pulled onto the nearest target on each axis. Pure TS, no Fabric
// or DOM.
//
// On each axis independently, each of the box's three lines (start, centre, end) is
// matched against every target line within the threshold (6 screen px, so 6 / zoom
// Canvas px, inclusive). The nearest wins; a tie goes Guide > Canvas > Layer. The
// offset is always whole px, snapped or not: snapping picks the whole offset that
// brings the line nearest its target, so a fractional target lands on the nearest
// whole px and its line is drawn all the same.
//
// Equal gaps (gaps.ts) join the same search on each axis: a place where the box sits
// with equal spaces to its neighbours is a target for its start line, the last in a tie.
// The row of the box on one axis is taken where the raw offset puts it on the other.
import { selectionBox, walkLayers, type Document, type MeasureText, type Rect } from '@bannerkit/core'
import { gapCandidates, gapMarks, type GapCandidate } from './gaps.ts'
import type { Mark, SnapLineMark } from './marks.ts'
import { buildTargets, lines, type Axis, type TargetLine, type Targets, type TargetSource } from './targets.ts'

/** The snap threshold in screen px. */
export const SNAP_DISTANCE = 6

export type Offset = { x: number; y: number }

export type MoveSnap = {
  /** The whole-px offset to move by. */
  offset: Offset
  /** What to draw: a snap line per target lined up with the result. */
  marks: Mark[]
}

/** Tie-break order of equally near targets: lower wins. */
const RANK: Record<TargetSource, number> = { guide: 0, canvas: 1, layer: 2 }

/** An equal gap loses a tie to every target line. */
const GAP_RANK = 3

/** Rounding to whole px, never −0. */
const whole = (value: number) => Math.round(value) || 0

/** Comparisons of Canvas px computed by different sums; far below any visible difference. */
const EPSILON = 1e-6

/** What a drag snaps with, taken once at its start: the Selection Box and the targets. */
export type MoveStart = { box: Rect; targets: Targets }

/**
 * Starts a drag of the Layers `ids` in `document`: their Selection Box (core
 * `selectionBox`, so a rotated Layer moves by its axis-aligned extent and a Group by
 * the union of its children) and the targets left by them. Undefined when none of
 * `ids` is in `document`.
 */
export function startMove(document: Document, ids: readonly string[], measure: MeasureText): MoveStart | undefined {
  const wanted = new Set(ids)
  const box = selectionBox(walkLayers(document).filter((v) => wanted.has(v.layer.id)).map((v) => v.layer), measure)
  return box && { box, targets: buildTargets(document, ids, measure) }
}

/** Snaps the start's Selection Box moved by `offset` (Canvas px) at `zoom`. */
export function snapMove({ box, targets }: MoveStart, offset: Offset, zoom: number): MoveSnap {
  const threshold = SNAP_DISTANCE / zoom
  const rects = targets.rects.map((t) => t.rect)
  const raw = { ...box, x: box.x + whole(offset.x), y: box.y + whole(offset.y) }
  const x = snapAxis(box, offset.x, targets.x, gapCandidates(raw, rects, 'x'), 'x', threshold)
  const y = snapAxis(box, offset.y, targets.y, gapCandidates(raw, rects, 'y'), 'y', threshold)
  const moved = { x: box.x + x.offset, y: box.y + y.offset, width: box.width, height: box.height }
  return {
    offset: { x: x.offset, y: y.offset },
    marks: [
      ...snapLines(moved, x.matched, 'x', targets),
      ...snapLines(moved, y.matched, 'y', targets),
      ...(x.gaps.length > 0 ? gapMarks(moved, rects, 'x', x.gaps) : []),
      ...(y.gaps.length > 0 ? gapMarks(moved, rects, 'y', y.gaps) : []),
    ],
  }
}

/** A drag that does not snap (Cmd/Ctrl held, Snapping off): still whole px, nothing drawn. */
export function freeMove(offset: Offset): MoveSnap {
  return { offset: { x: whole(offset.x), y: whole(offset.y) }, marks: [] }
}

type AxisSnap = {
  offset: number
  /** The target lines lined up with the result. */
  matched: TargetLine[]
  /** The equal gaps the result sits at, and how far it is off them (whole px). */
  gaps: { gap: number; slack: number }[]
}

function snapAxis(box: Rect, raw: number, targets: readonly TargetLine[], gaps: readonly GapCandidate[], axis: Axis, threshold: number): AxisSnap {
  const starts = lines(box, axis)
  // Every place the box can snap to: a target line for any of its lines, an equal gap for its start.
  const options = [
    ...starts.flatMap((start) => targets.map((target) => ({ start, at: target.at, rank: RANK[target.source] }))),
    ...gaps.map((gap) => ({ start: starts[0], at: gap.at, rank: GAP_RANK })),
  ]
  let best: { distance: number; rank: number; offset: number } | undefined
  for (const { start, at, rank } of options) {
    const distance = Math.abs(at - (start + raw))
    if (distance > threshold + EPSILON) continue
    if (best && (distance > best.distance + EPSILON || (distance > best.distance - EPSILON && rank >= best.rank))) continue
    best = { distance, rank, offset: whole(at - start) }
  }
  if (!best) return { offset: whole(raw), matched: [], gaps: [] }
  const offset = best.offset
  // Everything as near the result as the winner (exactly on it, for a whole-px target).
  const off = (start: number, at: number) => Math.abs(at - (start + offset))
  const residual = Math.min(...options.map((o) => off(o.start, o.at)))
  return {
    offset,
    matched: targets.filter((t) => starts.some((s) => off(s, t.at) <= residual + EPSILON)),
    gaps: gaps.filter((g) => off(starts[0], g.at) <= residual + EPSILON).map((g) => ({ gap: g.gap, slack: off(starts[0], g.at) })),
  }
}

/** One snap line per position and source among `matched` (see `SnapLineMark`). */
function snapLines(moved: Rect, matched: readonly TargetLine[], axis: Axis, targets: Targets): SnapLineMark[] {
  const across = axis === 'x' ? targets.canvas.height : targets.canvas.width
  const [movedFrom, , movedTo] = lines(moved, axis === 'x' ? 'y' : 'x')
  const marks = new Map<string, SnapLineMark>()
  for (const target of matched) {
    const key = `${target.source}:${target.at}`
    const own = target.source === 'layer' ? { from: Math.min(movedFrom, target.from), to: Math.max(movedTo, target.to) } : { from: 0, to: across }
    const mark = marks.get(key)
    if (mark) {
      mark.from = Math.min(mark.from, own.from)
      mark.to = Math.max(mark.to, own.to)
    } else marks.set(key, { kind: 'snap-line', axis, at: target.at, source: target.source, ...own })
  }
  return [...marks.values()]
}
