// A trailing debounce: `schedule` (re)starts the wait, and `run` is called with the
// latest arguments once `delay` ms pass without another `schedule`. Autosave and
// selection sync both wait this way.

export type Debounced<A extends unknown[]> = {
  /** Calls `run(...args)` `delay` ms from now, replacing any call still waiting. */
  schedule(...args: A): void
  /** Drops the waiting call, if any. */
  cancel(): void
}

export function debounce<A extends unknown[]>(run: (...args: A) => void, delay: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  return {
    schedule(...args) {
      cancel()
      timer = setTimeout(() => {
        timer = undefined
        run(...args)
      }, delay)
    },
    cancel,
  }
}
