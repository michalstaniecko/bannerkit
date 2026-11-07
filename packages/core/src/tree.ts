// The Layer tree: walking, finding and replacing Layers. Every place that goes
// over all Layers of a Document goes through here, so Groups (Document v2,
// ADR 0007) only need teaching to these functions. Pure, no DOM or Node APIs.
import type { Document, GroupLayer, Layer } from './document.ts'

/** Anything that holds Layers bottom to top: the Document or a Group. */
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
      if (layer.type === 'group') visit(layer, at)
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
 * touching the input. A Group's children are replaced first, so `replace`
 * gets the Group holding its new children (`visit` still describes where the
 * original sits). Layers `replace` returns as is are kept by reference; when
 * nothing changes the Document (and every Group) itself is returned.
 */
export function mapLayers(document: Document, replace: (layer: Layer, visit: LayerVisit) => Layer): Document {
  const visits = walkLayers(document)
  let next = 0
  const mapAll = (layers: Layer[]): Layer[] => {
    let changed = false
    const mapped = layers.map((layer) => {
      const visit = visits[next++]!
      let input = layer
      if (layer.type === 'group') {
        const children = mapAll(layer.layers)
        if (children !== layer.layers) input = { ...layer, layers: children }
      }
      const output = replace(input, visit)
      if (output !== layer) changed = true
      return output
    })
    return changed ? mapped : layers
  }
  const layers = mapAll(document.layers)
  return layers === document.layers ? document : { ...document, layers }
}

/**
 * The Document without the Layers `ids`, wherever they sit, without touching
 * the input. A Group left without children goes too, since an empty Group is
 * invalid. Unknown ids are ignored.
 */
export function removeLayers(document: Document, ids: readonly string[]): Document {
  const keep = (layers: Layer[]): Layer[] =>
    layers.flatMap((layer): Layer[] => {
      if (ids.includes(layer.id)) return []
      if (layer.type !== 'group') return [layer]
      const children = keep(layer.layers)
      if (children.length === 0) return []
      return [children.length === layer.layers.length ? layer : { ...layer, layers: children }]
    })
  return { ...document, layers: keep(document.layers) }
}

/** The Document with the Layer `id` replaced by `replace(layer)`, without touching the input. Unknown ids change nothing. */
export function replaceLayer(document: Document, id: string, replace: (layer: Layer) => Layer): Document {
  return mapLayers(document, (layer) => (layer.id === id ? replace(layer) : layer))
}

/**
 * Whether the Layer `id` is effectively locked or hidden (spec Q14): it or any Group
 * holding it is. `lockedBy` / `hiddenBy` name the nearest Group that locks or hides
 * it (absent when only its own flag does, or nothing). Undefined for an unknown id.
 */
export type InheritedFlags = { locked: boolean; hidden: boolean; lockedBy?: GroupLayer; hiddenBy?: GroupLayer }

export function inheritedFlags(root: LayerParent, id: string): InheritedFlags | undefined {
  const find = (layers: readonly Layer[], groups: readonly GroupLayer[]): InheritedFlags | undefined => {
    for (const layer of layers) {
      if (layer.id === id) {
        const lockedBy = groups.findLast((g) => g.locked === true)
        const hiddenBy = groups.findLast((g) => g.visible === false)
        const flags: InheritedFlags = { locked: layer.locked === true || lockedBy !== undefined, hidden: layer.visible === false || hiddenBy !== undefined }
        if (lockedBy) flags.lockedBy = lockedBy
        if (hiddenBy) flags.hiddenBy = hiddenBy
        return flags
      }
      if (layer.type === 'group') {
        const found = find(layer.layers, [...groups, layer])
        if (found) return found
      }
    }
    return undefined
  }
  return find(root.layers, [])
}
