// Autosave: the editor's `change` events schedule a save of the whole Document;
// it runs once interaction has stopped for `delay` ms (spec: 500). Saves never
// overlap: a Document scheduled during a save is saved right after it, and only
// the latest scheduled Document is ever saved.
import type { Document } from '@bannerkit/core'

export const AUTOSAVE_DELAY_MS = 500

export type AutosaveOptions = {
  delay?: number
  /** A save that failed. The Document stays unsaved until the next change is saved. */
  onError?: (error: unknown) => void
}

export type Autosave = {
  /** Saves `document` once no other change has come for `delay` ms. */
  schedule(document: Document): void
  /** Saves the pending Document now (if any) and resolves when every save has finished. */
  flush(): Promise<void>
  /** Drops the pending Document, e.g. when another Document is opened. */
  cancel(): void
}

export function createAutosave(
  save: (document: Document) => Promise<unknown>,
  { delay = AUTOSAVE_DELAY_MS, onError = () => {} }: AutosaveOptions = {},
): Autosave {
  let pending: Document | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  /** The save in flight (or a resolved promise): the next save chains on it. */
  let saving: Promise<void> = Promise.resolve()

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const run = (): Promise<void> => {
    clearTimer()
    saving = saving.then(async () => {
      const document = pending
      pending = undefined
      if (!document) return
      try {
        await save(document)
      } catch (error) {
        onError(error)
      }
    })
    return saving
  }

  return {
    schedule(document) {
      pending = document
      clearTimer()
      timer = setTimeout(run, delay)
    },
    flush: run,
    cancel() {
      clearTimer()
      pending = undefined
    },
  }
}
