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
import { selectionBox, walkLayers, type Document, type MeasureText, type Rect } from '@bannerkit/core'
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
  const x = snapAxis(box, offset.x, targets.x, 'x', threshold)
  const y = snapAxis(box, offset.y, targets.y, 'y', threshold)
  const moved = { x: box.x + x.offset, y: box.y + y.offset, width: box.width, height: box.height }
  return {
    offset: { x: x.offset, y: y.offset },
    marks: [...snapLines(moved, x.matched, 'x', targets), ...snapLines(moved, y.matched, 'y', targets)],
  }
}

/** A drag that does not snap (Cmd/Ctrl held, Snapping off): still whole px, nothing drawn. */
export function freeMove(offset: Offset): MoveSnap {
  return { offset: { x: whole(offset.x), y: whole(offset.y) }, marks: [] }
}

function snapAxis(box: Rect, raw: number, targets: readonly TargetLine[], axis: Axis, threshold: number): { offset: number; matched: TargetLine[] } {
  const starts = lines(box, axis)
  let best: { distance: number; rank: number; offset: number } | undefined
  for (const start of starts) {
    for (const target of targets) {
      const distance = Math.abs(target.at - (start + raw))
      if (distance > threshold + EPSILON) continue
      const rank = RANK[target.source]
      if (best && (distance > best.distance + EPSILON || (distance > best.distance - EPSILON && rank >= best.rank))) continue
      best = { distance, rank, offset: whole(target.at - start) }
    }
  }
  if (!best) return { offset: whole(raw), matched: [] }
  const offset = best.offset
  // Every target as near the result as the winner (exactly on it, for a whole-px target).
  const residual = Math.min(...starts.flatMap((s) => targets.map((t) => Math.abs(t.at - (s + offset)))))
  const matched = targets.filter((t) => starts.some((s) => Math.abs(t.at - (s + offset)) <= residual + EPSILON))
  return { offset, matched }
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
