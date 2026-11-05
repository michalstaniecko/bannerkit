// Autosave: the editor's `change` events schedule a save of the whole Document;
// it runs once interaction has stopped for `delay` ms (spec: 500). Saves never
// overlap: a Document scheduled during a save is saved right after it, and only
// the latest scheduled Document is ever saved. Live reload holds autosave while
// the human decides between their edits and a change made on disk.
import type { Document } from '@bannerkit/core'
import { debounce } from './debounce.ts'

export const AUTOSAVE_DELAY_MS = 500

export type AutosaveOptions = {
  delay?: number
  /** A save that failed. The Document stays unsaved (dirty) until it or a later change is saved. */
  onError?: (error: unknown) => void
}

export type Autosave = {
  /** Saves `document` once no other change has come for `delay` ms. */
  schedule(document: Document): void
  /**
   * Saves the pending Document now (if any) and resolves when every save has finished.
   * While held it saves nothing: the waiting change stays waiting for `release`.
   */
  flush(): Promise<void>
  /** Drops the pending Document, e.g. when another Document is opened. */
  cancel(): void
  /** True while a change is waiting to be saved or being saved. */
  dirty(): boolean
  /** Resolves once no save is in flight; a waiting change stays waiting. */
  idle(): Promise<void>
  /** Stops saving: changes wait (and stay dirty) until `release`. */
  hold(): void
  /** Undoes `hold`: a waiting change is saved `delay` ms from now. */
  release(): void
}

export function createAutosave(
  save: (document: Document) => Promise<unknown>,
  { delay = AUTOSAVE_DELAY_MS, onError = () => {} }: AutosaveOptions = {},
): Autosave {
  let pending: Document | undefined
  /** The save in flight (or a resolved promise): the next save chains on it. */
  let saving: Promise<void> = Promise.resolve()
  let inFlight = 0
  let held = false

  const run = (): Promise<void> => {
    timer.cancel()
    saving = saving.then(async () => {
      const document = pending
      pending = undefined
      if (!document) return
      inFlight++
      try {
        await save(document)
      } catch (error) {
        // Still unsaved: kept (unless a newer change replaced it) for the next flush.
        pending ??= document
        onError(error)
      } finally {
        inFlight--
      }
    })
    return saving
  }
  const timer = debounce(() => void run(), delay)

  return {
    schedule(document) {
      pending = document
      if (held) timer.cancel()
      else timer.schedule()
    },
    flush: () => (held ? saving : run()),
    cancel() {
      timer.cancel()
      pending = undefined
    },
    dirty: () => pending !== undefined || inFlight > 0,
    async idle() {
      // A save queued while waiting chains onto `saving`; wait for that one too.
      let current: Promise<void>
      do {
        current = saving
        await current
      } while (current !== saving)
    },
    hold() {
      held = true
      timer.cancel()
    },
    release() {
      held = false
      if (pending) timer.schedule()
      else timer.cancel()
    },
  }
}
