// Selection sync: the editor's `selection` events are sent to the server so an
// agent's `bannerkit inspect` sees what the human selected (spec: "sent to the
// server on change (debounced)"). Only the latest Selection is ever sent.
import { debounce } from './debounce.ts'

export const SELECTION_SYNC_DELAY_MS = 200

export type SelectionSyncOptions = {
  delay?: number
  /** A send that failed. The next selection change sends again. */
  onError?: (error: unknown) => void
}

export type SelectionSync = {
  /** Sends `layerIds` once the selection has not changed for `delay` ms. */
  schedule(layerIds: string[]): void
  /** Drops the pending Selection, e.g. when another Document is opened. */
  cancel(): void
}

export function createSelectionSync(
  send: (layerIds: string[]) => Promise<unknown>,
  { delay = SELECTION_SYNC_DELAY_MS, onError = () => {} }: SelectionSyncOptions = {},
): SelectionSync {
  const timer = debounce((layerIds: string[]) => void send(layerIds).catch(onError), delay)
  return { schedule: (layerIds) => timer.schedule(layerIds), cancel: () => timer.cancel() }
}
