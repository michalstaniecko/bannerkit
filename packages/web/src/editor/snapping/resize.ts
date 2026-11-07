// Snapping a resize (ADR 0008): the dragged edge of one unrotated leaf Layer's Box pulled
// onto the nearest target. Pure TS, no Fabric or DOM.
//
// Only the Box's edges snap, never the handle's: an image `contain` snaps its Box, not
// the letterboxed picture. A snapped edge lands on a whole px. Targets, the threshold
// (6 screen px, inclusive) and the tie-break (Guide > Canvas > Layer) are a drag's.
import { walkLayers, type Document, type MeasureText, type Rect } from '@bannerkit/core'
import type { Mark, SnapLineMark } from './marks.ts'
import { buildTargets, EPSILON, mergeSnapLines, nearestTarget, RANK, SNAP_DISTANCE, type Axis, type TargetLine, type Targets } from './targets.ts'

/** What a resize snaps to, taken once at its start. */
export type ResizeStart = { targets: Targets }

/**
 * The handle being dragged: on each axis, the Box edge it moves (`start`: left or top,
 * `end`: right or bottom; none: that axis does not change).
 */
export type ResizeHandle = {
  x?: Edge
  y?: Edge
  /** A corner keeping the Box's proportion (Fabric's default; Shift frees it). */
  proportional?: boolean
  /** Resizing from the centre (Alt): the opposite edge moves symmetrically. */
  centred?: boolean
}

export type Edge = 'start' | 'end'

export type ResizeSnap = {
  /** The Box to show. */
  box: Rect
  marks: Mark[]
}

/**
 * Starts a resize of the Layer `id` in `document`: the targets left by it. Undefined
 * when it is not an unrotated leaf of `document` (a Group, a rotated Layer and
 * several Layers resize without snapping).
 */
export function startResize(document: Document, id: string, measure: MeasureText): ResizeStart | undefined {
  const layer = walkLayers(document).find((v) => v.layer.id === id)?.layer
  if (!layer || layer.type === 'group' || (layer.rotation ?? 0) % 360 !== 0) return undefined
  return { targets: buildTargets(document, [id], measure) }
}

/**
 * Snaps the raw Box `box` (as the handle put it, Canvas px) of a resize by `handle` at
 * `zoom`. A free handle snaps each axis it moves on its own; a proportional corner snaps
 * the axis with the nearer target and scales the other by the same factor. The edge
 * that stays is the opposite one, or the centre when resizing from the centre.
 */
export function snapResize({ targets }: ResizeStart, box: Rect, handle: ResizeHandle, zoom: number): ResizeSnap {
  const threshold = SNAP_DISTANCE / zoom
  const hits: Hit[] = []
  for (const axis of ['x', 'y'] as const) {
    const edge = handle[axis]
    if (!edge) continue
    const hit = nearest(edgeAt(box, axis, edge), targets[axis], threshold)
    if (hit) hits.push({ axis, edge, at: Math.round(hit.at), hit })
  }
  if (handle.proportional && handle.x && handle.y) {
    // The nearer target wins (on a tie, the higher-ranked one, then x).
    hits.sort((a, b) => a.hit.distance - b.hit.distance || a.hit.rank - b.hit.rank)
    hits.splice(1)
  }
  let out = box
  const snapped: Hit[] = []
  for (const hit of hits) {
    const size = sizeAfter(box, hit, handle.centred)
    if (size < 1) continue // never shrink the Box away
    out = resizeAxis(out, hit.axis, handle[hit.axis], size, handle.centred)
    if (handle.proportional && handle.x && handle.y) {
      const other = hit.axis === 'x' ? 'y' : 'x'
      out = resizeAxis(out, other, handle[other], (sizeOf(box, other) * size) / sizeOf(box, hit.axis), handle.centred)
    }
    snapped.push(hit)
  }
  return { box: out, marks: snapped.flatMap(({ axis, at, hit }) => snapLines(out, axis, at, hit, targets)) }
}

type Hit = { axis: Axis; edge: Edge; at: number; hit: TargetLine & { distance: number; rank: number } }

/** The size on its axis of `box` with the snapped edge of `hit` at its target. */
function sizeAfter(box: Rect, { axis, edge, at }: Hit, centred = false): number {
  const start = startOf(box, axis)
  const end = start + sizeOf(box, axis)
  if (centred) return 2 * Math.abs(at - (start + end) / 2)
  return edge === 'end' ? at - start : end - at
}

/** `box` resized to `size` on `axis`, keeping the edge opposite `edge` (or the centre). */
function resizeAxis(box: Rect, axis: Axis, edge: Edge | undefined, size: number, centred = false): Rect {
  const start = startOf(box, axis)
  const end = start + sizeOf(box, axis)
  if (centred) return withSpan(box, axis, (start + end) / 2 - size / 2, size)
  return edge === 'start' ? withSpan(box, axis, end - size, size) : withSpan(box, axis, start, size)
}

/**
 * The snap lines of an edge snapped to `at` on `axis` (its target `hit`): one per
 * position and source of every target as near `at` as `hit` (see `SnapLineMark`).
 */
function snapLines(box: Rect, axis: Axis, at: number, hit: TargetLine, targets: Targets): SnapLineMark[] {
  const residual = Math.abs(hit.at - at)
  const other = axis === 'x' ? 'y' : 'x'
  const from = startOf(box, other)
  const matched = targets[axis].filter((target) => Math.abs(target.at - at) <= residual + EPSILON)
  return mergeSnapLines(axis, matched, targets.canvas, { from, to: from + sizeOf(box, other) })
}

/** The target nearest `at` within `threshold`, with its distance. */
function nearest(at: number, targets: readonly TargetLine[], threshold: number): (TargetLine & { distance: number; rank: number }) | undefined {
  return nearestTarget(
    targets.map((target) => ({ ...target, distance: Math.abs(target.at - at), rank: RANK[target.source] })),
    threshold,
  )
}

const startOf = (box: Rect, axis: Axis) => (axis === 'x' ? box.x : box.y)
const sizeOf = (box: Rect, axis: Axis) => (axis === 'x' ? box.width : box.height)
const edgeAt = (box: Rect, axis: Axis, edge: Edge) => startOf(box, axis) + (edge === 'end' ? sizeOf(box, axis) : 0)

/** `box` with its `start` and `size` on `axis` replaced. */
const withSpan = (box: Rect, axis: Axis, start: number, size: number): Rect =>
  axis === 'x' ? { ...box, x: start, width: size } : { ...box, y: start, height: size }
