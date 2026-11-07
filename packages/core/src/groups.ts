// Changing the shape of the Layer tree: grouping, ungrouping and moving Layers
// between Groups (Document v2, ADR 0007). Pure, never mutates its input, no DOM
// or Node APIs. The editor (Cmd+G, the Layer tree) and the CLI (`layer group`,
// `layer ungroup`) both go through here.
import type { Document, GroupLayer, Layer } from './document.ts'
import { nextLayerId } from './schema.ts'
import { findLayer, type LayerParent, type LayerVisit } from './tree.ts'

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

/** The Document with `parent`'s (the Document's or a Group's) children replaced by `layers`. */
function withChildren(document: Document, parent: LayerParent, layers: Layer[]): Document {
  if (parent === document) return { ...document, layers }
  const rebuild = (siblings: readonly Layer[]): Layer[] =>
    siblings.map((layer) => {
      if (layer.type !== 'group') return layer
      if (layer === parent) return { ...layer, layers }
      const children = rebuild(layer.layers)
      return children.every((c, i) => c === layer.layers[i]) ? layer : { ...layer, layers: children }
    })
  return { ...document, layers: rebuild(document.layers) }
}
