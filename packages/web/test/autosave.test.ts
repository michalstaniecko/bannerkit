// Autosave: a debounced save of the whole Document after interaction stops.
import type { Document } from '@bannerkit/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosave } from '../src/autosave.ts'

const doc = (name: string): Document => ({ version: 1, name, canvas: { width: 10, height: 10, background: null }, layers: [] })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('autosave', () => {
  it('saves the latest Document once, 500 ms after the last change', async () => {
    const saved: string[] = []
    const autosave = createAutosave(async (d) => void saved.push(d.name))

    autosave.schedule(doc('a'))
    await vi.advanceTimersByTimeAsync(400)
    autosave.schedule(doc('b'))
    await vi.advanceTimersByTimeAsync(499)
    expect(saved).toEqual([])
    await vi.advanceTimersByTimeAsync(1)

    expect(saved).toEqual(['b'])
  })

  it('never overlaps two saves; a change during a save is saved after it', async () => {
    const log: string[] = []
    let release = () => {}
    const autosave = createAutosave(async (d) => {
      log.push(`start ${d.name}`)
      if (d.name === 'a') await new Promise<void>((resolve) => (release = resolve))
      log.push(`end ${d.name}`)
    })

    autosave.schedule(doc('a'))
    await vi.advanceTimersByTimeAsync(500)
    autosave.schedule(doc('b'))
    await vi.advanceTimersByTimeAsync(500)
    expect(log).toEqual(['start a'])
    release()
    await vi.advanceTimersByTimeAsync(0)

    expect(log).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  it('flush saves a pending Document now and waits for it', async () => {
    const saved: string[] = []
    const autosave = createAutosave(async (d) => void saved.push(d.name))
    autosave.schedule(doc('a'))

    await autosave.flush()

    expect(saved).toEqual(['a'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(saved).toEqual(['a'])
  })

  it('cancel drops a pending save', async () => {
    const save = vi.fn(async () => {})
    const autosave = createAutosave(save)
    autosave.schedule(doc('a'))

    autosave.cancel()
    await vi.advanceTimersByTimeAsync(1000)

    expect(save).not.toHaveBeenCalled()
  })

  it('reports a failed save and keeps saving later changes', async () => {
    const errors: unknown[] = []
    const saved: string[] = []
    const autosave = createAutosave(
      async (d) => {
        if (d.name === 'a') throw new Error('disk full')
        saved.push(d.name)
      },
      { onError: (error) => errors.push(error) },
    )

    autosave.schedule(doc('a'))
    await vi.advanceTimersByTimeAsync(500)
    autosave.schedule(doc('b'))
    await vi.advanceTimersByTimeAsync(500)

    expect(errors).toEqual([new Error('disk full')])
    expect(saved).toEqual(['b'])
  })

  it('is dirty while a change is waiting or being saved', async () => {
    let release = () => {}
    const autosave = createAutosave(() => new Promise<void>((resolve) => (release = resolve)))
    expect(autosave.dirty()).toBe(false)

    autosave.schedule(doc('a'))
    expect(autosave.dirty()).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(autosave.dirty()).toBe(true)
    release()
    await vi.advanceTimersByTimeAsync(0)

    expect(autosave.dirty()).toBe(false)
  })

  it('idle waits for the save in flight without saving a waiting change', async () => {
    const log: string[] = []
    let release = () => {}
    const autosave = createAutosave(async (d) => {
      if (d.name === 'a') await new Promise<void>((resolve) => (release = resolve))
      log.push(`saved ${d.name}`)
    })
    autosave.schedule(doc('a'))
    await vi.advanceTimersByTimeAsync(500)
    autosave.schedule(doc('b'))

    const idle = autosave.idle().then(() => log.push('idle'))
    release()
    await idle

    expect(log).toEqual(['saved a', 'idle'])
    expect(autosave.dirty()).toBe(true)
  })

  it('hold keeps changes unsaved until release', async () => {
    const saved: string[] = []
    const autosave = createAutosave(async (d) => void saved.push(d.name))

    autosave.schedule(doc('a'))
    autosave.hold()
    autosave.schedule(doc('b'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(saved).toEqual([])
    expect(autosave.dirty()).toBe(true)
    autosave.release()
    await vi.advanceTimersByTimeAsync(500)

    expect(saved).toEqual(['b'])
  })

  it('flush while held saves nothing: the held change waits for release', async () => {
    const saved: string[] = []
    const autosave = createAutosave(async (d) => void saved.push(d.name))
    autosave.schedule(doc('a'))
    autosave.hold()

    await autosave.flush()

    expect(saved).toEqual([])
    expect(autosave.dirty()).toBe(true)
    autosave.release()
    await autosave.flush()
    expect(saved).toEqual(['a'])
  })

  it('a failed save stays dirty until a later save succeeds; flush retries it', async () => {
    const saved: string[] = []
    let fail = true
    const autosave = createAutosave(async (d) => {
      if (fail) throw new Error('offline')
      saved.push(d.name)
    })
    autosave.schedule(doc('a'))
    await vi.advanceTimersByTimeAsync(500)
    expect(autosave.dirty()).toBe(true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(saved).toEqual([])

    fail = false
    await autosave.flush()

    expect(saved).toEqual(['a'])
    expect(autosave.dirty()).toBe(false)
  })
})
