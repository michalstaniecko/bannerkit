// Measurement (ADR 0008): with Alt held, the distances in px between the Selection Box
// `a` and a box `b` (the extent of the Layer under the pointer, or the Canvas). Pure TS,
// no Fabric or DOM.
//
// On each axis on its own:
// - boxes apart give one distance, between their facing edges;
// - overlapping boxes (in part, or one inside the other) give the distances between
//   their edges on the same side (start to start, end to end), zeros left out.
// A distance is drawn across the middle of what the boxes share on the other axis; when
// they share nothing there, across the middle of `a`, with a dashed extension to `b`.
import type { Rect } from '@bannerkit/core'
import type { MeasureMark } from './marks.ts'
import type { Axis } from './targets.ts'

/** The Measurement Marks between `a` and `b`: the `x` distances, then the `y` ones. */
export function measure(a: Rect, b: Rect): MeasureMark[] {
  return [...measureAxis(a, b, 'x'), ...measureAxis(a, b, 'y')]
}

/** A distance as its label shows it: to 0.1 px, without a trailing `.0` (`12`, `12.5`). */
export function formatDistance(distance: number): string {
  return String(Math.round(distance * 10) / 10)
}

type Span = { start: number; end: number }

const span = (rect: Rect, axis: Axis): Span =>
  axis === 'x' ? { start: rect.x, end: rect.x + rect.width } : { start: rect.y, end: rect.y + rect.height }

function measureAxis(a: Rect, b: Rect, axis: Axis): MeasureMark[] {
  const other: Axis = axis === 'x' ? 'y' : 'x'
  const sa = span(a, axis)
  const sb = span(b, axis)
  // Pairs of [edge of a, edge of b] to measure between.
  let pairs: [number, number][]
  if (sa.end <= sb.start) pairs = [[sa.end, sb.start]]
  else if (sb.end <= sa.start) pairs = [[sa.start, sb.end]]
  else
    pairs = [
      [sa.start, sb.start],
      [sa.end, sb.end],
    ]
  const oa = span(a, other)
  const ob = span(b, other)
  const shared = { start: Math.max(oa.start, ob.start), end: Math.min(oa.end, ob.end) }
  const overlaps = shared.end > shared.start
  const at = overlaps ? (shared.start + shared.end) / 2 : (oa.start + oa.end) / 2
  // Without anything shared, `at` lies outside `b`: the nearer edge of `b` is where the extension ends.
  const reach = at < ob.start ? ob.start : ob.end
  return pairs
    .filter(([ea, eb]) => ea !== eb)
    .map(([ea, eb]) => {
      const mark: MeasureMark = { kind: 'measure', axis, at, from: Math.min(ea, eb), to: Math.max(ea, eb), label: formatDistance(Math.abs(eb - ea)) }
      if (!overlaps) mark.extension = { at: eb, from: Math.min(at, reach), to: Math.max(at, reach) }
      return mark
    })
}
