// Undo history: in-memory Document snapshots (spec, Undo). The list holds the
// Document after each step, oldest first, with `at` pointing at the one shown;
// recording a step drops whatever was undone after it. At most `cap` snapshots
// are kept, so the oldest steps fall off.
import type { Document } from '@bannerkit/core'

export const HISTORY_CAP = 100

export type History = {
  /** Forgets every step; `document` is the only snapshot (after `load`). */
  reset(document: Document): void
  /** Records `document` as the newest step. */
  record(document: Document): void
  /** Moves one step back and returns that snapshot, or undefined at the oldest. */
  undo(): Document | undefined
  /** Moves one step forward and returns that snapshot, or undefined at the newest. */
  redo(): Document | undefined
  canUndo(): boolean
  canRedo(): boolean
}

export function createHistory(cap = HISTORY_CAP): History {
  let snapshots: Document[] = []
  let at = -1
  return {
    reset(document) {
      snapshots = [structuredClone(document)]
      at = 0
    },
    record(document) {
      snapshots = [...snapshots.slice(0, at + 1), structuredClone(document)].slice(-cap)
      at = snapshots.length - 1
    },
    undo() {
      if (at <= 0) return undefined
      return structuredClone(snapshots[--at]!)
    },
    redo() {
      if (at >= snapshots.length - 1) return undefined
      return structuredClone(snapshots[++at]!)
    },
    canUndo: () => at > 0,
    canRedo: () => at < snapshots.length - 1,
  }
}
