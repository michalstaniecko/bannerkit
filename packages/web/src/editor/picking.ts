// Which Layer a pointer gesture on the Canvas selects when Groups are in the way
// (spec Q16/Q17). A hit is a *path*: the top-level Entry under the pointer down to the
// deepest Layer hit in it (one Entry per level). Pure: Entries in, Entries out; the
// editor turns them into Fabric's active object.
//
// - A click selects the top-level Layer, unless the Selection holds a child of a Group
//   on the path: then it selects the Layer one level below that Group (the click stays
//   in the Group's context, so a sibling of the selected child is selected).
// - Cmd/Ctrl+click selects the deepest Layer at once.
// - A double click on a selected Group selects its Layer under the pointer.
// - Escape selects the Group of each selected child.
// - The Selection never holds a Layer with one of its ancestors: selecting one drops
//   the other.
import type { Entry } from './scene.ts'

/** Whether `ancestor` holds `entry`, at any depth. */
export function isAncestor(ancestor: Entry, entry: Entry): boolean {
  for (let parent = entry.parent; parent; parent = parent.parent) if (parent === ancestor) return true
  return false
}

/** The Entry a click on `path` selects, the Selection being `selected`; `deepest` for Cmd/Ctrl+click. */
export function clickTarget(path: readonly Entry[], selected: readonly Entry[], deepest: boolean): Entry {
  if (deepest) return path[path.length - 1]!
  // The deepest Group on the path whose child is selected is the context.
  for (let i = path.length - 2; i >= 0; i--) if (selected.some((s) => s.parent === path[i])) return path[i + 1]!
  return path[0]!
}

/** The Entry a double click on `path` selects: one level below the selected Group on it, if any. */
export function doubleClickTarget(path: readonly Entry[], selected: readonly Entry[]): Entry | undefined {
  const at = path.findIndex((e) => selected.includes(e))
  return at >= 0 ? path[at + 1] : undefined
}

/** The Selection after Escape: each selected child's Group instead (undefined when nothing selected is in a Group). */
export function escapeSelection(selected: readonly Entry[]): Entry[] | undefined {
  if (!selected.some((e) => e.parent)) return undefined
  return withoutDescendants([...new Set(selected.map((e) => e.parent ?? e))])
}

/** The Selection after Shift+click on `target`: toggled, and its ancestors and descendants dropped. */
export function toggleSelection(selected: readonly Entry[], target: Entry): Entry[] {
  if (selected.includes(target)) return selected.filter((e) => e !== target)
  return [...selected.filter((e) => !isAncestor(e, target) && !isAncestor(target, e)), target]
}

/** `entries` without any that has an ancestor among them (an ancestor wins). */
export function withoutDescendants(entries: readonly Entry[]): Entry[] {
  return entries.filter((e) => !entries.some((other) => isAncestor(other, e)))
}
