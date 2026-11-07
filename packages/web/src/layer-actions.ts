// Layer list and toolbar actions: pure functions from a Document to the next one.
// The UI applies each result with `editor.apply(document, { cause: 'layers' })`, so
// every action is exactly one undo step. Inputs are never mutated.
import {
  duplicateLayers as duplicate,
  findLayer,
  group,
  nextLayerId,
  removeLayers,
  replaceLayer,
  ungroup,
  type Document,
  type Layer,
} from '@bannerkit/core'

const copy = (document: Document): Document => structuredClone(document)

/** Moves Layer `id` to the stacking position currently held by `targetId`. */
export function moveLayer(document: Document, id: string, targetId: string): Document {
  const next = copy(document)
  const from = findLayer(next, id)
  const to = findLayer(next, targetId)
  if (!from || !to || from.parent !== to.parent || from.index === to.index) return next
  // `next` is a fresh copy, so its parents' `layers` may be changed in place.
  const siblings = from.parent.layers as Layer[]
  const [layer] = siblings.splice(from.index, 1)
  siblings.splice(to.index, 0, layer!)
  return next
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

/** Adds a Layer on top of the stack, centred in the Canvas, with the next readable id. */
export function addLayer(document: Document, spec: NewLayer): { document: Document; id: string } {
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
  next.layers.push(layer)
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
