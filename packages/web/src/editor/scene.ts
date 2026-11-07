// The editor's scene: the Layer tree as shown, one Entry per Layer pairing it with its
// Fabric object. A Group's Entry holds its children's Entries in draw order, and its
// object (a DocumentGroup, group.ts) holds their objects in the same order, so the
// Entry tree and the Fabric object tree have the same shape.
//
// An Entry's `base` is the Layer as last laid out (load, a committed modification, an
// in-place relayout). For a leaf, the Layer it shows now is read back from its object
// (`objectToLayer`); a Group shows `layerOf` its children, its own fields from `base`.
// Whatever changes an Entry's children's bases calls `syncBase` on its root, so a
// Group's `base.layers` is never stale.
import type { GroupLayer, Layer, LeafLayer } from '@bannerkit/core'
import type { FabricObject } from 'fabric'
import type { DocumentGroup } from './group.ts'
import { objectToLayer } from './mapper.ts'

export type LeafEntry = { base: LeafLayer; object: FabricObject; parent: GroupEntry | undefined }
export type GroupEntry = { base: GroupLayer; object: DocumentGroup; parent: GroupEntry | undefined; children: Entry[] }
export type Entry = LeafEntry | GroupEntry

export const isGroupEntry = (entry: Entry): entry is GroupEntry => entry.base.type === 'group'

/** Entries for `layers` shown by `objects` (made by `layerToObject`, same order), under `parent`. */
export function buildEntries(layers: readonly Layer[], objects: readonly FabricObject[], parent?: GroupEntry): Entry[] {
  return layers.map((layer, i) => {
    const object = objects[i]!
    if (layer.type !== 'group') return { base: layer, object, parent }
    const entry: GroupEntry = { base: layer, object: object as DocumentGroup, parent, children: [] }
    entry.children = buildEntries(layer.layers, entry.object.getObjects(), entry)
    return entry
  })
}

/** Every Entry under `roots`, in draw order (a Group before its children). */
export function allEntries(roots: readonly Entry[]): Entry[] {
  return roots.flatMap((entry) => (isGroupEntry(entry) ? [entry, ...allEntries(entry.children)] : [entry]))
}

/** The leaf Entries in `entry` (itself when it is a leaf), in draw order. */
export function leavesOf(entry: Entry): LeafEntry[] {
  return isGroupEntry(entry) ? entry.children.flatMap(leavesOf) : [entry]
}

/** The top-level Entry `entry` is in (itself at the top level). */
export function rootOf(entry: Entry): Entry {
  return entry.parent ? rootOf(entry.parent) : entry
}

/** The Layer `entry` shows now, read back from the objects. */
export function layerOf(entry: Entry): Layer {
  return isGroupEntry(entry) ? { ...entry.base, layers: entry.children.map(layerOf) } : objectToLayer(entry.object, entry.base)
}

/** Rebuilds every Group's `base` under `entry` from its children's bases; returns `entry.base`. */
export function syncBase(entry: Entry): Layer {
  if (isGroupEntry(entry)) entry.base = { ...entry.base, layers: entry.children.map(syncBase) }
  return entry.base
}

/** Whether `layers` can be laid out on the objects of `entries`: the same tree of ids and types, and the same image `src`. */
export function sameShape(entries: readonly Entry[], layers: readonly Layer[]): boolean {
  return entries.length === layers.length && layers.every((layer, i) => sameObject(entries[i]!, layer))
}

function sameObject(entry: Entry, next: Layer): boolean {
  const base = entry.base
  if (base.id !== next.id || base.type !== next.type) return false
  if (isGroupEntry(entry)) return sameShape(entry.children, (next as GroupLayer).layers)
  return base.type !== 'image' || base.src === (next as typeof base).src
}

/** Sets the bases under `entry` to `layer` (of the same shape, see `sameShape`). */
export function rebase(entry: Entry, layer: Layer): void {
  entry.base = layer as never
  if (isGroupEntry(entry)) entry.children.forEach((child, i) => rebase(child, (layer as GroupLayer).layers[i]!))
}
