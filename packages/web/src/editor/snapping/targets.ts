// Snapping targets (ADR 0008): the lines a drag can be pulled onto, built once at the
// start of a gesture from the Document. Pure TS, no Fabric or DOM.
//
// Every effectively visible Layer (leaf or Group, locked or not, inside the Canvas or
// not) gives three vertical lines (left, centre, right of its `layerExtent`) and three
// horizontal ones. The Layers being moved, their descendants and their ancestors give
// none (a Group's extent follows its moving child). The Canvas gives its edges and
// centre, and every Guide in `document.guides` its line.
import { layerExtent, walkLayers, type Document, type Layer, type MeasureText, type Rect } from '@bannerkit/core'

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
