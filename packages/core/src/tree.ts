// The Layer tree: walking, finding and replacing Layers. Every place that goes
// over all Layers of a Document goes through here, so Groups (Document v2,
// ADR 0007) only need teaching to these functions. Pure, no DOM or Node APIs.
import type { Document, Layer } from './document.ts'

/** Anything that holds Layers bottom to top: the Document (and, in v2, a Group). */
export type LayerParent = { readonly layers: readonly Layer[] }

/** One Layer as met in the tree. */
export type LayerVisit = {
  layer: Layer
  /** The Document or Group whose `layers` hold `layer`. */
  parent: LayerParent
  /** Position in `parent.layers` (0 = bottom). */
  index: number
  /** Issue path of the Layer: `layers[1]`, `layers[1].layers[0]` in a Group. */
  path: string
}

/** The Issue path of the Layer reached by `indices`, one per level from the root: `[1, 0]` → `layers[1].layers[0]`. */
export function layerPath(indices: readonly number[]): string {
  return indices.map((i) => `layers[${i}]`).join('.')
}

/** Every Layer under `root` in draw order (bottom to top, a Group before its children). */
export function walkLayers(root: LayerParent): LayerVisit[] {
  const visits: LayerVisit[] = []
  const visit = (parent: LayerParent, indices: readonly number[]) =>
    parent.layers.forEach((layer, index) => {
      const at = [...indices, index]
      visits.push({ layer, parent, index, path: layerPath(at) })
      // v2: a Group recurses here with `visit(layer, at)`.
    })
  visit(root, [])
  return visits
}

/** The Layer with `id` anywhere under `root`, with its parent, position and path. */
export function findLayer(root: LayerParent, id: string): LayerVisit | undefined {
  return walkLayers(root).find((v) => v.layer.id === id)
}

/**
 * The Document with every Layer replaced by `replace(layer, visit)`, without
 * touching the input. Layers `replace` returns as is are kept by reference;
 * when nothing changes the Document itself is returned.
 */
export function mapLayers(document: Document, replace: (layer: Layer, visit: LayerVisit) => Layer): Document {
  const visits = walkLayers(document)
  let changed = false
  const layers = document.layers.map((layer, i) => {
    const next = replace(layer, visits[i]!)
    if (next !== layer) changed = true
    return next
  })
  return changed ? { ...document, layers } : document
}

/** The Document with the Layer `id` replaced by `replace(layer)`, without touching the input. Unknown ids change nothing. */
export function replaceLayer(document: Document, id: string, replace: (layer: Layer) => Layer): Document {
  return mapLayers(document, (layer) => (layer.id === id ? replace(layer) : layer))
}
