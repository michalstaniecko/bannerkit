// Align and Distribute (ADR 0008): moving Layers by their `layerExtent`s. Pure,
// never mutates its input, no DOM or Node APIs. The CLI (`layer align`,
// `layer distribute`) and the editor both go through here.
import type { Document, Layer } from './document.ts'
import { layerExtent, selectionBox } from './extent.ts'
import type { Rect } from './fit.ts'
import type { TreeEditError, TreeEditResult } from './groups.ts'
import type { MeasureText } from './textLayout.ts'
import { ancestorsOf, findLayer, replaceLayer, translateLayer, walkLayers } from './tree.ts'

/** The edges and centres Align lines up: three on the x axis, three on the y axis. */
export const ALIGN_EDGES = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const
export type AlignEdge = (typeof ALIGN_EDGES)[number]

/** What Align lines Layers up with: the Canvas, or the Selection Box of the Layers. */
export const ALIGN_TARGETS = ['canvas', 'selection'] as const
export type AlignTarget = (typeof ALIGN_TARGETS)[number]

/** The axis an edge lies on. */
export const edgeAxis = (edge: AlignEdge): 'x' | 'y' => (edge === 'left' || edge === 'hcenter' || edge === 'right' ? 'x' : 'y')

/** Where `edge` of `rect` is on its axis. */
function edgeOf(rect: Rect, edge: AlignEdge): number {
  switch (edge) {
    case 'left':
      return rect.x
    case 'hcenter':
      return rect.x + rect.width / 2
    case 'right':
      return rect.x + rect.width
    case 'top':
      return rect.y
    case 'vcenter':
      return rect.y + rect.height / 2
    case 'bottom':
      return rect.y + rect.height
  }
}

/**
 * Moves the Layers `ids` so `edges` (at most one per axis) of each one's
 * `layerExtent` line up with the same edges of the target: `to: 'canvas'` the
 * Canvas, each Layer on its own; `to: 'selection'` the Selection Box of the
 * Layers. `to` defaults to the Canvas for one Layer and the Selection Box for
 * several. Each Layer moves by `translateLayer` (a Group with all its leaves)
 * by the rounded delta, keeping its rotation. Answers the ids of the Layers
 * that moved, in input order.
 */
export function alignLayers(
  document: Document,
  ids: readonly string[],
  edges: readonly AlignEdge[],
  measure: MeasureText,
  { to }: { to?: AlignTarget } = {},
): TreeEditResult<{ moved: string[] }> {
  if (edges.length === 0) return fail('INVALID_INPUT', 'align needs at least one edge')
  for (const axis of ['x', 'y'] as const) {
    const onAxis = edges.filter((edge) => edgeAxis(edge) === axis)
    if (onAxis.length > 1) return fail('INVALID_INPUT', `align takes one edge per axis, got ${onAxis.join(' and ')}`)
  }
  const chosen = chooseLayers(document, ids, 1, 'align needs at least one Layer')
  if (!chosen.ok) return chosen
  const { unique, layers } = chosen
  const target =
    (to ?? (layers.length === 1 ? 'canvas' : 'selection')) === 'canvas'
      ? { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height }
      : selectionBox(layers, measure)!
  const deltas = layers.map((layer) => {
    const extent = layerExtent(layer, measure)
    const delta = { x: 0, y: 0 }
    for (const edge of edges) delta[edgeAxis(edge)] = Math.round(edgeOf(target, edge) - edgeOf(extent, edge))
    return delta
  })
  return moveBy(document, unique, deltas)
}

/** The axes Distribute spaces Layers along. */
export const DISTRIBUTE_AXES = ['x', 'y'] as const
export type DistributeAxis = (typeof DISTRIBUTE_AXES)[number]

/**
 * Spaces the Layers `ids` along `axis` by their `layerExtent`s, ordered by the
 * start of the extent, then its centre, then draw order. Without `gap`
 * (at least three Layers) the first and the last stay and the rest get equal
 * space between them (negative when they overlap), each position worked out
 * from the first and rounded on its own. With `gap` whole px (at least two Layers)
 * the first stays and each next one goes `gap` after where the previous one
 * landed. Moves like `alignLayers`; answers the moved ids in input order.
 */
export function distributeLayers(
  document: Document,
  ids: readonly string[],
  axis: DistributeAxis,
  measure: MeasureText,
  { gap }: { gap?: number } = {},
): TreeEditResult<{ moved: string[] }> {
  if (gap !== undefined && !(Number.isInteger(gap) && gap >= 0)) {
    return fail('INVALID_INPUT', `gap must be a whole number of px >= 0, got ${gap}`)
  }
  const chosen =
    gap === undefined
      ? chooseLayers(document, ids, 3, 'distributing evenly needs at least three Layers')
      : chooseLayers(document, ids, 2, 'distributing with a gap needs at least two Layers')
  if (!chosen.ok) return chosen
  const { unique, layers } = chosen
  const drawOrder = new Map(walkLayers(document).map(({ layer }, i) => [layer.id, i]))
  const spans = layers.map((layer, input) => {
    const extent = layerExtent(layer, measure)
    const [start, size] = axis === 'x' ? [extent.x, extent.width] : [extent.y, extent.height]
    return { input, start, size, order: drawOrder.get(layer.id)! }
  })
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.start + a.size / 2 - (b.start + b.size / 2) || a.order - b.order)
  const deltas = spans.map(() => ({ x: 0, y: 0 }))
  const first = sorted[0]!
  if (gap === undefined) {
    const last = sorted[sorted.length - 1]!
    const sizes = sorted.reduce((sum, s) => sum + s.size, 0)
    const space = (last.start + last.size - first.start - sizes) / (sorted.length - 1)
    // Exact positions from the first Layer, each rounded on its own, so the error does not add up.
    let position = first.start
    for (let i = 1; i < sorted.length - 1; i++) {
      position += sorted[i - 1]!.size + space
      const span = sorted[i]!
      deltas[span.input]![axis] = Math.round(position - span.start)
    }
  } else {
    let end = first.start + first.size
    for (const span of sorted.slice(1)) {
      const delta = Math.round(end + gap - span.start)
      deltas[span.input]![axis] = delta
      end = span.start + delta + span.size
    }
  }
  return moveBy(document, unique, deltas)
}

const fail = (code: TreeEditError['code'], message: string): TreeEditError => ({ ok: false, code, message })

/**
 * The Layers `ids` (deduplicated, in input order), when there are at least
 * `min`, all exist, and none sits in a Group that is also among them.
 */
function chooseLayers(
  document: Document,
  ids: readonly string[],
  min: number,
  tooFew: string,
): { ok: true; unique: string[]; layers: Layer[] } | TreeEditError {
  const unique = [...new Set(ids)]
  const layers: Layer[] = []
  for (const id of unique) {
    const visit = findLayer(document, id)
    if (!visit) return fail('NOT_FOUND', `no Layer with id "${id}"`)
    layers.push(visit.layer)
  }
  if (unique.length < min) return fail('INVALID_INPUT', tooFew)
  const chosen = new Set(unique)
  for (const id of unique) {
    const holder = ancestorsOf(document, id).find((group) => chosen.has(group.id))
    if (holder) return fail('INVALID_INPUT', `Layer "${id}" is inside Group "${holder.id}", which is also given`)
  }
  return { ok: true, unique, layers }
}

/** The Document with Layer `ids[i]` moved by `deltas[i]`, and the ids that really moved. */
function moveBy(document: Document, ids: readonly string[], deltas: readonly { x: number; y: number }[]): TreeEditResult<{ moved: string[] }> {
  let next = document
  const moved: string[] = []
  ids.forEach((id, i) => {
    const { x, y } = deltas[i]!
    if (x === 0 && y === 0) return
    next = replaceLayer(next, id, (layer) => translateLayer(layer, x, y))
    moved.push(id)
  })
  return { ok: true, document: next, moved }
}
