// Equal gaps (ADR 0008): where a dragged box sits with equal spaces to its neighbours,
// and the marks of every equal space. Pure TS, no Fabric or DOM. The pattern is
// Excalidraw's `getVisibleGaps` (read, not a dependency).
//
// Each axis on its own. The row of a box on `x` is the target Layers overlapping it
// on `y` (and the other way round); neighbours are adjacent in the row with free
// space between them. A box can sit
//   (a) between its nearest neighbours on either side, with equal gaps to both, or
//   (b) as a continuation: an existing gap between two adjacent targets repeated from
//       the nearer of them, when that one is the box's nearest neighbour (to the
//       right of the pair or, symmetrically, to the left).
import type { Rect } from '@bannerkit/core'
import type { GapMark } from './marks.ts'
import type { Axis } from './targets.ts'

/** A place for a box on one axis: its start there and the gap it repeats. */
export type GapCandidate = { at: number; gap: number }

/** Comparisons of Canvas px computed by different sums; far below any visible difference. */
const EPSILON = 1e-6

type Span = { start: number; end: number; from: number; to: number; moving?: boolean }

/** `rect` as a span on `axis` (start..end) and across it (from..to). */
function span(rect: Rect, axis: Axis): Span {
  return axis === 'x'
    ? { start: rect.x, end: rect.x + rect.width, from: rect.y, to: rect.y + rect.height }
    : { start: rect.y, end: rect.y + rect.height, from: rect.x, to: rect.x + rect.width }
}

/** The spans of `rects` overlapping `box` across `axis`, which make its row. */
function row(box: Span, rects: readonly Rect[], axis: Axis): Span[] {
  return rects.map((r) => span(r, axis)).filter((s) => s.from < box.to - EPSILON && s.to > box.from + EPSILON)
}

/** Whether any of `spans` takes some of the open stretch `lo..hi` on the axis. */
function blocked(spans: readonly Span[], lo: number, hi: number): boolean {
  return spans.some((s) => s.start < hi - EPSILON && s.end > lo + EPSILON)
}

/** The pairs of adjacent spans in a row: free space between them and nothing in it. */
function adjacent(spans: readonly Span[]): [Span, Span][] {
  const pairs: [Span, Span][] = []
  for (const p of spans) {
    for (const q of spans) {
      if (q.start - p.end > EPSILON && !blocked(spans, p.end, q.start)) pairs.push([p, q])
    }
  }
  return pairs
}

/** The places on `axis` where `box` (as it is across the axis) sits with equal gaps in its row of `rects`. */
export function gapCandidates(box: Rect, rects: readonly Rect[], axis: Axis): GapCandidate[] {
  const own = span(box, axis)
  const size = own.end - own.start
  const spans = row(own, rects, axis)
  const out: GapCandidate[] = []
  for (const [a, b] of adjacent(spans)) {
    const space = b.start - a.end
    // (a) between a and b
    if (space - size > EPSILON) out.push({ at: a.end + (space - size) / 2, gap: (space - size) / 2 })
    // (b) the gap a..b repeated after b, or before a
    const after = b.end + space
    if (!blocked(spans, b.end, after + size)) out.push({ at: after, gap: space })
    const before = a.start - space - size
    if (!blocked(spans, before, a.start)) out.push({ at: before, gap: space })
  }
  return out
}

/**
 * The marks of the equal gaps in the row of `moved` (on `axis`) among `rects`: every
 * gap between adjacent boxes, `moved` included, as long as one of `gaps` (exactly, or
 * within `slack` for a gap of `moved`, which lands on whole px).
 */
export function gapMarks(moved: Rect, rects: readonly Rect[], axis: Axis, gaps: readonly { gap: number; slack: number }[]): GapMark[] {
  const own: Span = { ...span(moved, axis), moving: true }
  const spans = [...row(own, rects, axis), own]
  const marks: GapMark[] = []
  for (const [a, b] of adjacent(spans)) {
    const length = b.start - a.end
    const moving = a.moving || b.moving
    if (!gaps.some((g) => Math.abs(length - g.gap) <= (moving ? g.slack : 0) + EPSILON)) continue
    const from = Math.max(a.from, b.from)
    const to = Math.min(a.to, b.to)
    const at = from < to ? (from + to) / 2 : (own.from + own.to) / 2
    marks.push({ kind: 'gap', axis, from: a.end, to: b.start, at, label: px(length) })
  }
  return marks.sort((m, n) => m.from - n.from)
}

/** A length in px to 0.1, without a trailing “.0”. */
function px(value: number): string {
  return String(Math.round(value * 10) / 10 || 0)
}
