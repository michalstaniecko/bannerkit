// Layer list and toolbar actions: pure functions from a Document to the next one.
// The UI applies each result with `editor.apply(document, { cause: 'layers' })`, so
// every action is exactly one undo step. Inputs are never mutated.
import {
  duplicateLayers as duplicate,
  findLayer,
  group,
  moveLayerTo,
  nextLayerId,
  removeLayers,
  replaceLayer,
  ungroup,
  walkLayers,
  type Document,
  type GroupLayer,
  type Layer,
  type TreeEditResult,
} from '@bannerkit/core'

const copy = (document: Document): Document => structuredClone(document)

/** Where a dragged row is dropped on another: above or below it in its parent, or on top of a Group's Layers. */
export type DropPosition = 'above' | 'below' | 'into'

/**
 * Moves Layer `id` to where it was dropped on the row of `targetId` (core `moveLayerTo`).
 * "Above" is higher in the stack (the list shows the top first). A Group left empty
 * goes; a Group cannot go into its own descendant, nor a Layer onto itself.
 */
export function dropLayer(document: Document, id: string, targetId: string, position: DropPosition): TreeEditResult {
  if (id === targetId) return { ok: false, code: 'INVALID_INPUT', message: `Layer "${id}" cannot be dropped on itself` }
  if (position === 'into') return moveLayerTo(document, id, { into: targetId })
  const from = findLayer(document, id)
  const to = findLayer(document, targetId)
  if (!from) return { ok: false, code: 'NOT_FOUND', message: `no Layer with id "${id}"` }
  if (!to) return { ok: false, code: 'NOT_FOUND', message: `no Layer with id "${targetId}"` }
  // The index counts the destination's Layers with the moved one already taken out.
  const taken = from.parent === to.parent && from.index < to.index ? 1 : 0
  const index = to.index - taken + (position === 'above' ? 1 : 0)
  const into = to.parent === document ? null : (to.parent as GroupLayer).id
  return moveLayerTo(document, id, { into, index })
}

/** What a Layer's `visible` and `locked` are when the key is left out. */
export const LAYER_FLAG_DEFAULTS = { visible: true, locked: false } as const
export type LayerFlag = keyof typeof LAYER_FLAG_DEFAULTS

/** A Layer's `visible` or `locked`, its default when left out. */
export const layerFlag = (layer: Layer, flag: LayerFlag): boolean => layer[flag] ?? LAYER_FLAG_DEFAULTS[flag]

/** `layer` with `visible` or `locked` set to `value`; the default value is written by leaving the key out. */
export function withLayerFlag<L extends Layer>(layer: L, flag: LayerFlag, value: boolean): L {
  const next = { ...layer }
  if (value === LAYER_FLAG_DEFAULTS[flag]) delete next[flag]
  else next[flag] = value
  return next
}

/** Sets a Layer's `visible` or `locked` (see `withLayerFlag`). */
export function setLayerFlag(document: Document, id: string, flag: LayerFlag, value: boolean): Document {
  return replaceLayer(copy(document), id, (l) => withLayerFlag(l, flag, value))
}

/** What the toolbar adds. An image refers to an added Asset and its intrinsic size. */
export type NewLayer = { type: 'rect' } | { type: 'text' } | { type: 'image'; src: string; width: number; height: number }

/** Share of the Canvas a new rect or image takes at most, per side. */
const NEW_SHARE = 0.5

/**
 * Adds a Layer centred in the Canvas, with the next readable id. Where it goes depends
 * on the Selection: right above its topmost Layer (in draw order), in that Layer's
 * parent, when that Layer is in a Group or is a Group itself; on top of the root otherwise.
 */
export function addLayer(document: Document, spec: NewLayer, selection: readonly string[] = []): { document: Document; id: string } {
  const next = copy(document)
  const { width: cw, height: ch } = next.canvas
  const id = nextLayerId(next, spec.type)
  const centred = (width: number, height: number) => ({ x: (cw - width) / 2, y: (ch - height) / 2, width, height })
  let layer: Layer
  if (spec.type === 'rect') {
    layer = { id, type: 'rect', ...centred(Math.round(cw * NEW_SHARE), Math.round(ch * NEW_SHARE)), fill: '#cccccc' }
  } else if (spec.type === 'text') {
    const fontSize = Math.max(8, Math.round(Math.min(cw, ch) / 8))
    const box = centred(Math.round(cw * 0.8), Math.round(fontSize * 1.5))
    layer = { id, type: 'text', ...box, text: 'Text', fontFamily: 'Inter', fontWeight: 700, fontSize, fill: '#000000' }
  } else {
    const scale = Math.min(1, (cw * NEW_SHARE) / spec.width, (ch * NEW_SHARE) / spec.height)
    layer = { id, type: 'image', ...centred(spec.width * scale, spec.height * scale), src: spec.src, fit: 'contain' }
  }
  const topmost = walkLayers(next).findLast((v) => selection.includes(v.layer.id))
  if (topmost && (topmost.parent !== next || topmost.layer.type === 'group')) {
    // `next` is a fresh copy, so its parents' `layers` may be changed in place.
    ;(topmost.parent.layers as Layer[]).splice(topmost.index + 1, 0, layer)
  } else next.layers.push(layer)
  return { document: next, id }
}

/** Removes the Layers `ids`. */
export function deleteLayers(document: Document, ids: readonly string[]): Document {
  return removeLayers(copy(document), ids)
}

/** How far a duplicate is moved from its original, so it is visible, in Document px. */
const DUPLICATE_OFFSET = 10

/**
 * Copies each of the Layers `ids` directly above its original, offset, with the next
 * readable id (a Group's copy renumbers its whole subtree; core `duplicateLayers`).
 * Answers the copies' ids, bottom → top.
 */
export function duplicateLayers(document: Document, ids: readonly string[]): { document: Document; ids: string[] } {
  return duplicate(document, ids, { offset: DUPLICATE_OFFSET })
}

/** A Layer action's next Document and the Layers to select after it. */
export type LayerActionResult = { document: Document; select: string[] }

/**
 * Groups the Selection (Cmd+G) into a new unnamed Group, selected after. Undefined —
 * the action is unavailable — without a Selection or when its Layers have different parents.
 */
export function groupSelection(document: Document, selection: readonly string[]): LayerActionResult | undefined {
  if (selection.length === 0) return undefined
  const result = group(document, selection)
  return result.ok ? { document: result.document, select: [result.id] } : undefined
}

/**
 * Ungroups every selected Group (Cmd+Shift+G) and selects their former children.
 * Undefined — the action is unavailable — when the Selection holds no Group.
 */
export function ungroupSelection(document: Document, selection: readonly string[]): LayerActionResult | undefined {
  const groups = selection.filter((id) => findLayer(document, id)?.layer.type === 'group')
  if (groups.length === 0) return undefined
  let next = document
  const select: string[] = []
  for (const id of groups) {
    const result = ungroup(next, id)
    if (!result.ok) return undefined
    next = result.document
    select.push(...result.ids)
  }
  return { document: next, select }
}
