// Snapping targets (ADR 0008): the lines a drag can be pulled onto, built once at the
// start of a gesture from the Document. Pure TS, no Fabric or DOM.
//
// Every effectively visible Layer (leaf or Group, locked or not, inside the Canvas or
// not) gives three vertical lines (left, centre, right of its `layerExtent`) and three
// horizontal ones. The Layers being moved, their descendants and their ancestors give
// none (a Group's extent follows its moving child). The Canvas gives its edges and
// centre, and every Guide in `document.guides` its line.
import { layerExtent, walkLayers, type Document, type Layer, type MeasureText, type Rect } from '@bannerkit/core'
import type { SnapLineMark } from './marks.ts'

/** The snap threshold in screen px (so `SNAP_DISTANCE / zoom` Canvas px, inclusive). */
export const SNAP_DISTANCE = 6

/** Lines on the `x` axis are vertical (at an x), on `y` horizontal (at a y). */
export type Axis = 'x' | 'y'

/** What a target line belongs to; also the tie-break order of equally near targets (first wins). */
export type TargetSource = 'guide' | 'canvas' | 'layer'

/** One line a drag can snap to. */
export type TargetLine = {
  /** The Canvas coordinate of the line on its axis. */
  at: number
  source: TargetSource
  /** Where what gave the line spans on the other axis (a Layer's extent; the Canvas for a Guide or the Canvas). */
  from: number
  to: number
  /** The Layer that gave it (`source: 'layer'`). */
  layerId?: string
}

export type Targets = {
  x: TargetLine[]
  y: TargetLine[]
  /** The Canvas size, which Canvas and Guide lines span. */
  canvas: { width: number; height: number }
  /** The extents of the target Layers (for tickets that need boxes, not lines, e.g. equal spacing). */
  rects: { layerId: string; rect: Rect }[]
}

/** Builds the targets of a drag of the Layers `moving` (ids) in `document`. */
export function buildTargets(document: Document, moving: readonly string[], measure: MeasureText): Targets {
  const { width, height } = document.canvas
  const x: TargetLine[] = []
  const y: TargetLine[] = []
  for (const at of document.guides?.x ?? []) x.push({ at, source: 'guide', from: 0, to: height })
  for (const at of document.guides?.y ?? []) y.push({ at, source: 'guide', from: 0, to: width })
  for (const at of [0, width / 2, width]) x.push({ at, source: 'canvas', from: 0, to: height })
  for (const at of [0, height / 2, height]) y.push({ at, source: 'canvas', from: 0, to: width })
  const rects: Targets['rects'] = []
  for (const layer of targetLayers(document, new Set(moving))) {
    const rect = layerExtent(layer, measure)
    rects.push({ layerId: layer.id, rect })
    for (const at of lines(rect, 'x')) x.push({ at, source: 'layer', from: rect.y, to: rect.y + rect.height, layerId: layer.id })
    for (const at of lines(rect, 'y')) y.push({ at, source: 'layer', from: rect.x, to: rect.x + rect.width, layerId: layer.id })
  }
  return { x, y, canvas: { width, height }, rects }
}

/** The three lines of `rect` on `axis`: start, centre, end. */
export function lines(rect: Rect, axis: Axis): [number, number, number] {
  const start = axis === 'x' ? rect.x : rect.y
  const size = axis === 'x' ? rect.width : rect.height
  return [start, start + size / 2, start + size]
}

/** The effectively visible Layers that are not moving, nor inside or around one that is. */
function targetLayers(document: Document, moving: ReadonlySet<string>): Layer[] {
  const out: Layer[] = []
  const visit = (layers: readonly Layer[]) => {
    for (const layer of layers) {
      if (layer.visible === false || moving.has(layer.id)) continue
      if (layer.type === 'group') {
        // A Group around a moving Layer is not a target; its other children still are.
        if (!holdsAny(layer, moving)) out.push(layer)
        visit(layer.layers)
      } else out.push(layer)
    }
  }
  visit(document.layers)
  return out
}

function holdsAny(group: Layer, ids: ReadonlySet<string>): boolean {
  return walkLayers({ layers: [group] }).some((v) => ids.has(v.layer.id))
}

/** Tie-break order of equally near targets: lower wins. */
export const RANK: Record<TargetSource, number> = { guide: 0, canvas: 1, layer: 2 }

/** Comparisons of Canvas px computed by different sums; far below any visible difference. */
export const EPSILON = 1e-6

/** Rounding to whole px, never −0. */
export const whole = (value: number) => Math.round(value) || 0

/** A place something can snap to: how far it is and its tie-break rank (lower wins). */
export type Candidate = { distance: number; rank: number }

/**
 * The nearest of `candidates` within `threshold` Canvas px (inclusive); of equally near
 * ones (to `EPSILON`), the lowest rank, then the first. Undefined when none is in reach.
 */
export function nearestTarget<T extends Candidate>(candidates: Iterable<T>, threshold: number): T | undefined {
  let best: T | undefined
  for (const candidate of candidates) {
    const { distance, rank } = candidate
    if (distance > threshold + EPSILON) continue
    if (best && (distance > best.distance + EPSILON || (distance > best.distance - EPSILON && rank >= best.rank))) continue
    best = candidate
  }
  return best
}

/**
 * One snap line per position and source among `matched` on `axis` (see `SnapLineMark`).
 * A Canvas or Guide line runs across the Canvas; a Layer's from `along` (the snapped
 * box's span on the other axis, if any) to the farthest Layer matched there.
 */
export function mergeSnapLines(axis: Axis, matched: readonly TargetLine[], canvas: Targets['canvas'], along?: { from: number; to: number }): SnapLineMark[] {
  const across = axis === 'x' ? canvas.height : canvas.width
  const marks = new Map<string, SnapLineMark>()
  for (const target of matched) {
    const key = `${target.source}:${target.at}`
    const own =
      target.source !== 'layer'
        ? { from: 0, to: across }
        : along
          ? { from: Math.min(along.from, target.from), to: Math.max(along.to, target.to) }
          : { from: target.from, to: target.to }
    const mark = marks.get(key)
    if (mark) {
      mark.from = Math.min(mark.from, own.from)
      mark.to = Math.max(mark.to, own.to)
    } else marks.set(key, { kind: 'snap-line', axis, at: target.at, source: target.source, ...own })
  }
  return [...marks.values()]
}
