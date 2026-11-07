// Changing the shape of the Layer tree: grouping, ungrouping and moving Layers
// between Groups (Document v2, ADR 0007). Pure, never mutates its input, no DOM
// or Node APIs. The editor (Cmd+G, the Layer tree) and the CLI (`layer group`,
// `layer ungroup`) both go through here.
import type { Document, GroupLayer, Layer } from './document.ts'
import { nextLayerId } from './schema.ts'
import {
  findLayer,
  flatMapLayers,
  mapLayers,
  translateLayer,
  walkLayers,
  withoutEmptyGroups,
  type LayerParent,
  type LayerVisit,
} from './tree.ts'

/** Why a tree operation was refused; the codes match the server's OpError codes. */
export type TreeEditError = { ok: false; code: 'NOT_FOUND' | 'INVALID_INPUT'; message: string }

/** A tree operation's outcome: the next Document (plus `extra`), or why there is none. */
export type TreeEditResult<Extra = {}> = ({ ok: true; document: Document } & Extra) | TreeEditError

const fail = (code: TreeEditError['code'], message: string): TreeEditError => ({ ok: false, code, message })
const notFound = (id: string) => fail('NOT_FOUND', `no Layer with id "${id}"`)

/**
 * Wraps the Layers `ids` in a new Group (`group-<n>`, no `name` unless given)
 * placed where the topmost of them was. The Layers keep their stacking order
 * and their coordinates (Layers hold Canvas coordinates at every depth). They
 * need at least one id and a common parent. Answers the new Group's id.
 */
export function group(document: Document, ids: readonly string[], options: { name?: string } = {}): TreeEditResult<{ id: string }> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return fail('INVALID_INPUT', 'group needs at least one Layer')
  const visits: LayerVisit[] = []
  for (const id of unique) {
    const visit = findLayer(document, id)
    if (!visit) return notFound(id)
    visits.push(visit)
  }
  const parent = visits[0]!.parent
  if (visits.some((v) => v.parent !== parent)) return fail('INVALID_INPUT', 'grouped Layers must share the same parent')
  const id = nextLayerId(document, 'group')
  const chosen = new Set(unique)
  const top = Math.max(...visits.map((v) => v.index))
  const wrapped: GroupLayer = {
    id,
    type: 'group',
    ...(options.name !== undefined && { name: options.name }),
    layers: parent.layers.filter((l) => chosen.has(l.id)),
  }
  const layers = parent.layers.flatMap((layer, index): Layer[] =>
    index === top ? [wrapped] : chosen.has(layer.id) ? [] : [layer],
  )
  return { ok: true, document: withChildren(document, parent, layers), id }
}

/**
 * Puts the children of Group `id` where the Group was, in order and with
 * their coordinates untouched. The Group's own `name`, `opacity`, `visible`
 * and `locked` go with it. Answers the former children's ids, bottom to top.
 */
export function ungroup(document: Document, id: string): TreeEditResult<{ ids: string[] }> {
  const visit = findLayer(document, id)
  if (!visit) return notFound(id)
  const { layer, parent, index } = visit
  if (layer.type !== 'group') return fail('INVALID_INPUT', `Layer "${id}" is a ${layer.type}, not a Group`)
  const layers = parent.layers.flatMap((l, i) => (i === index ? layer.layers : [l]))
  return { ok: true, document: withChildren(document, parent, layers), ids: layer.layers.map((l) => l.id) }
}

/**
 * Where `moveLayerTo` puts a Layer: into Group `into` (`null` = the Document
 * root) at `index` in its `layers` (0 = bottom), counted with the moved Layer
 * already taken out. Without `index` the Layer goes on top.
 */
export type LayerDestination = { into: string | null; index?: number }

/**
 * Moves Layer `id` (a Group with its whole subtree) to `destination`, leaving
 * its coordinates alone. A Group the move leaves empty is dropped in the same
 * step (an empty Group is invalid), so when that Group sat below the
 * destination in the same parent, the Layer ends one position lower than
 * `index`. A Group cannot go into itself or its descendant.
 */
export function moveLayerTo(document: Document, id: string, destination: LayerDestination): TreeEditResult {
  const visit = findLayer(document, id)
  if (!visit) return notFound(id)
  const { into } = destination
  if (into !== null) {
    const target = findLayer(document, into)
    if (!target) return notFound(into)
    if (target.layer.type !== 'group') return fail('INVALID_INPUT', `Layer "${into}" is a ${target.layer.type}, not a Group`)
    if (into === id) return fail('INVALID_INPUT', `Group "${id}" cannot go into itself`)
    if (visit.layer.type === 'group' && findLayer(visit.layer, into)) {
      return fail('INVALID_INPUT', `Group "${id}" cannot go into its descendant "${into}"`)
    }
  }
  const taken = withChildren(
    document,
    visit.parent,
    visit.parent.layers.filter((_, i) => i !== visit.index),
  )
  const parent: LayerParent = into === null ? taken : findLayer(taken, into)!.layer as GroupLayer
  const index = destination.index ?? parent.layers.length
  if (!Number.isInteger(index) || index < 0 || index > parent.layers.length) {
    return fail('INVALID_INPUT', `position ${index} is outside 0..${parent.layers.length}`)
  }
  const layers = [...parent.layers.slice(0, index), visit.layer, ...parent.layers.slice(index)]
  return { ok: true, document: withoutEmptyGroups(withChildren(taken, parent, layers)) }
}

/** Moves Layer `id` into Group `groupId` at `index` (default: on top). See `moveLayerTo`. */
export function moveIntoGroup(document: Document, id: string, groupId: string, index?: number): TreeEditResult {
  return moveLayerTo(document, id, { into: groupId, index })
}

/**
 * Moves Layer `id` out of its Group into the Group's parent: right above the
 * Group by default, or at `index` in the parent's `layers`. A Group left
 * empty is dropped, so the Layer takes its place. See `moveLayerTo`.
 */
export function moveOutOfGroup(document: Document, id: string, index?: number): TreeEditResult {
  const visit = findLayer(document, id)
  if (!visit) return notFound(id)
  if (visit.parent === document) return fail('INVALID_INPUT', `Layer "${id}" is not in a Group`)
  const group = visit.parent as GroupLayer
  const outer = findLayer(document, group.id)!
  const into = outer.parent === document ? null : (outer.parent as GroupLayer).id
  return moveLayerTo(document, id, { into, index: index ?? outer.index + 1 })
}

/**
 * Copies each of the Layers `ids` directly above its original, in the same
 * parent, with the next readable id. A Group's copy gives every Layer in it
 * a new id too. Leaves are moved by `offset` px on both axes (default 0).
 * Unknown ids are ignored. Answers the copies' ids, bottom to top.
 */
export function duplicateLayers(
  document: Document,
  ids: readonly string[],
  { offset = 0 }: { offset?: number } = {},
): { document: Document; ids: string[] } {
  const originals = walkLayers(document).filter(({ layer }) => ids.includes(layer.id))
  // Ids first, bottom to top (a Group's before its children's), each one clear of the ids given before it.
  const given: Layer[] = []
  const fresh = (original: Layer): Layer => {
    const tree = { layers: [original] }
    const ids = new Map(
      walkLayers(tree).map(({ layer, path }) => {
        const id = nextLayerId({ layers: [...document.layers, ...given] }, layer.type)
        given.push({ ...layer, id })
        return [path, id]
      }),
    )
    const renamed = mapLayers(tree, (layer, { path }) => ({ ...layer, id: ids.get(path)! })).layers[0]!
    return translateLayer(renamed, offset, offset)
  }
  const copies = new Map(originals.map(({ layer }) => [layer.id, fresh(layer)]))
  // Then each copy right above its original.
  const next = flatMapLayers(document, (layer) => {
    const copy = copies.get(layer.id)
    return copy ? [layer, copy] : [layer]
  })
  return { document: next, ids: [...copies.values()].map((l) => l.id) }
}

/** The Document with `parent`'s (the Document's or a Group's) children replaced by `layers`. */
function withChildren(document: Document, parent: LayerParent, layers: Layer[]): Document {
  if (parent === document) return { ...document, layers }
  return mapLayers(document, (layer, visit) => (layer.type === 'group' && visit.layer === parent ? { ...layer, layers } : layer))
}
