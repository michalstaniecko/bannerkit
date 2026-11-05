// Selection sync: the editor's `selection` events are sent to the server, debounced.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSelectionSync } from '../src/selection-sync.ts'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('selection sync', () => {
  it('sends only the latest Selection, once the selection has settled', async () => {
    const sent: string[][] = []
    const sync = createSelectionSync(async (ids) => void sent.push(ids), { delay: 200 })

    sync.schedule(['rect-1'])
    await vi.advanceTimersByTimeAsync(100)
    sync.schedule(['rect-1', 'text-1'])
    await vi.advanceTimersByTimeAsync(199)
    expect(sent).toEqual([])
    await vi.advanceTimersByTimeAsync(1)

    expect(sent).toEqual([['rect-1', 'text-1']])
  })

  it('sends an empty Selection when everything is deselected', async () => {
    const sent: string[][] = []
    const sync = createSelectionSync(async (ids) => void sent.push(ids), { delay: 200 })

    sync.schedule([])
    await vi.advanceTimersByTimeAsync(200)

    expect(sent).toEqual([[]])
  })

  it('cancel drops a pending Selection; a failed send is reported, not thrown', async () => {
    const errors: unknown[] = []
    const sent: string[][] = []
    const sync = createSelectionSync(
      async (ids) => {
        if (ids[0] === 'bad') throw new Error('offline')
        sent.push(ids)
      },
      { delay: 200, onError: (e) => errors.push(e) },
    )

    sync.schedule(['rect-1'])
    sync.cancel()
    await vi.advanceTimersByTimeAsync(500)
    sync.schedule(['bad'])
    await vi.advanceTimersByTimeAsync(200)

    expect(sent).toEqual([])
    expect(errors).toHaveLength(1)
  })
})
