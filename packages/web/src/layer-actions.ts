// Layer list and toolbar actions: pure functions from a Document to the next one.
// The UI applies each result with `editor.apply(document, { cause: 'layers' })`, so
// every action is exactly one undo step. Inputs are never mutated.
import { nextLayerId, type Document, type Layer } from '@bannerkit/core'

const copy = (document: Document): Document => structuredClone(document)

/** Moves Layer `id` to the stacking position currently held by `targetId`. */
export function moveLayer(document: Document, id: string, targetId: string): Document {
  const next = copy(document)
  const from = next.layers.findIndex((l) => l.id === id)
  const to = next.layers.findIndex((l) => l.id === targetId)
  if (from < 0 || to < 0 || from === to) return next
  const [layer] = next.layers.splice(from, 1)
  next.layers.splice(to, 0, layer!)
  return next
}

const FLAG_DEFAULT = { visible: true, locked: false } as const
export type LayerFlag = keyof typeof FLAG_DEFAULT

/** Sets a Layer's `visible` or `locked`; the default value is written by leaving the field out. */
export function setLayerFlag(document: Document, id: string, flag: LayerFlag, value: boolean): Document {
  const next = copy(document)
  const layer = next.layers.find((l) => l.id === id)
  if (!layer) return next
  if (value === FLAG_DEFAULT[flag]) delete layer[flag]
  else layer[flag] = value
  return next
}

/** What the toolbar adds. An image refers to an uploaded Asset and its intrinsic size. */
export type NewLayer = { type: 'rect' } | { type: 'text' } | { type: 'image'; src: string; width: number; height: number }

/** Share of the Canvas a new rect or image takes at most, per side. */
const NEW_SHARE = 0.5

/** Adds a Layer on top of the stack, centred in the Canvas, with the next readable id. */
export function addLayer(document: Document, spec: NewLayer): { document: Document; id: string } {
  const next = copy(document)
  const { width: cw, height: ch } = next.canvas
  const id = nextLayerId(next.layers, spec.type)
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
  const next = copy(document)
  next.layers = next.layers.filter((l) => !ids.includes(l.id))
  return next
}

/** How far a duplicate is moved from its original, so it is visible, in Document px. */
const DUPLICATE_OFFSET = 10

/**
 * Copies each of the Layers `ids` directly above its original, offset, with the next
 * readable id. Answers the copies' ids, bottom → top.
 */
export function duplicateLayers(document: Document, ids: readonly string[]): { document: Document; ids: string[] } {
  const next = copy(document)
  const copies: string[] = []
  const layers: Layer[] = []
  for (const layer of next.layers) {
    layers.push(layer)
    if (!ids.includes(layer.id)) continue
    const id = nextLayerId([...next.layers, ...layers], layer.type)
    layers.push({ ...structuredClone(layer), id, x: layer.x + DUPLICATE_OFFSET, y: layer.y + DUPLICATE_OFFSET })
    copies.push(id)
  }
  next.layers = layers
  return { document: next, ids: copies }
}
