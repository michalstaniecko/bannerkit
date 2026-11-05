// Selection sync: the editor's `selection` events are sent to the server so an
// agent's `bannerkit inspect` sees what the human selected (spec: "sent to the
// server on change (debounced)"). Only the latest Selection is ever sent.

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
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  return {
    schedule(layerIds) {
      cancel()
      timer = setTimeout(() => {
        timer = undefined
        send(layerIds).catch(onError)
      }, delay)
    },
    cancel,
  }
}
