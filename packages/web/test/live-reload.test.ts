// S2: live reload in the editor (jsdom + node-canvas). A `document-changed` hash
// that is the editor's own save is ignored; any other change reloads a clean
// editor as one undo step, and raises a conflict when edits are unsaved.
import type { Document, Layer } from '@bannerkit/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createAutosave } from '../src/autosave.ts'
import { createEditor, type Editor } from '../src/editor/index.ts'
import { createLiveReload, SaveConflict, type Conflict } from '../src/live-reload.ts'

const rect = (x: number): Layer => ({ id: 'rect-1', type: 'rect', x, y: 100, width: 100, height: 50, fill: '#ff0000' })
const doc = (x: number): Document => ({ version: 2, name: 'hero', canvas: { width: 400, height: 300, background: '#ffffff' }, layers: [rect(x)] })

let editor: Editor | undefined
afterEach(async () => {
  await editor?.destroy()
  editor = undefined
  document.body.innerHTML = ''
})

/**
 * Opens `doc(100)` in an editor wired like the app: changes are autosaved through
 * live reload to a fake disk (a save answers the new hash, or a conflict when the
 * file is not the version the editor last had), and live reload reads that disk.
 */
async function open() {
  const container = document.createElement('div')
  document.body.append(container)
  editor = createEditor({ loadFonts: async () => {} })
  editor.mount(container)
  let version = 0
  const disk = { document: doc(100), hash: 'h0' }
  /** Writes `document` to disk as someone else (or as the editor), answering its hash. */
  const write = (document: Document) => {
    disk.document = structuredClone(document)
    disk.hash = `h${++version}`
    return disk.hash
  }
  let releaseSave: (() => void) | undefined
  let slowSaves = false
  const autosave = createAutosave((document) => live.save(document), { delay: 20 })
  const conflicts: (Conflict | null)[] = []
  const live = createLiveReload({
    editor,
    autosave,
    read: async () => structuredClone(disk),
    // The editor's save, with the REST precondition: written only over `expectedHash`.
    write: async (document, expectedHash) => {
      if (slowSaves) await new Promise<void>((resolve) => (releaseSave = resolve))
      if (expectedHash !== undefined && expectedHash !== disk.hash) return { conflict: true }
      return { hash: write(document) }
    },
    onConflict: (conflict) => conflicts.push(conflict),
  })
  await editor.load(disk.document)
  live.known(disk.hash)
  editor.on('change', (event) => {
    if (event.cause !== 'reload') autosave.schedule(event.document)
  })
  return {
    editor,
    autosave,
    live,
    disk,
    write,
    conflicts,
    /** Saves made from now on wait for `release()`. */
    slowSaves: () => {
      slowSaves = true
      return () => releaseSave?.()
    },
  }
}

/** An edit by the human (one undo step), autosaved like any other. */
const edit = (e: Editor, x: number) => e.apply(doc(x), { cause: 'json' })
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('live reload', () => {
  it('reloads a clean editor silently, as one undo step', async () => {
    const { editor, live, write, conflicts } = await open()

    await live.changed(write(doc(250)))

    expect(editor.getDocument()).toEqual(doc(250))
    expect(conflicts).toEqual([])
    expect(await editor.undo()).toBe(true)
    expect(editor.getDocument()).toEqual(doc(100))
    expect(editor.canUndo()).toBe(false)
  })

  it('keeps the Selection across a reload, so the Inspector shows the reloaded values', async () => {
    const { editor, live, write } = await open()
    editor.select(['rect-1'])

    await live.changed(write(doc(250)))

    expect(editor.getSelection()).toEqual(['rect-1'])
  })

  it('ignores its own autosave echo', async () => {
    const { editor, autosave, live, disk, conflicts } = await open()
    await edit(editor, 120)
    await autosave.flush()

    await live.changed(disk.hash)

    expect(editor.getDocument()).toEqual(doc(120))
    expect(conflicts).toEqual([])
    expect(await editor.undo()).toBe(true)
    expect(editor.canUndo()).toBe(false)
  })

  it('ignores the echo of a save still in flight', async () => {
    const { editor, live, conflicts, slowSaves } = await open()
    const release = slowSaves()
    await edit(editor, 120)
    await wait(40)

    // The file is written before the save answers, so the echo can arrive first.
    const echo = live.changed('h1')
    release()
    await echo

    expect(conflicts).toEqual([])
    expect(editor.getDocument()).toEqual(doc(120))
  })

  it('raises a conflict when the editor has unsaved edits, and holds autosave', async () => {
    const { editor, live, disk, write, conflicts } = await open()
    await edit(editor, 120)

    await live.changed(write(doc(250)))
    await wait(60)

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).not.toBeNull()
    expect(editor.getDocument()).toEqual(doc(120))
    expect(disk.document).toEqual(doc(250))
  })

  it('"reload" shows the file on disk, as one undo step, and drops the unsaved edits', async () => {
    const { editor, live, disk, write, conflicts } = await open()
    await edit(editor, 120)
    await live.changed(write(doc(250)))

    await conflicts[0]!.reload()
    await wait(60)

    expect(conflicts.at(-1)).toBeNull()
    expect(editor.getDocument()).toEqual(doc(250))
    expect(disk.document).toEqual(doc(250))
    await editor.undo()
    expect(editor.getDocument()).toEqual(doc(120))
  })

  it('"keep mine" saves the editor\'s Document over the file on disk', async () => {
    const { editor, live, disk, write, conflicts } = await open()
    await edit(editor, 120)
    await live.changed(write(doc(250)))

    await conflicts[0]!.keepMine()

    expect(conflicts.at(-1)).toBeNull()
    expect(editor.getDocument()).toEqual(doc(120))
    expect(disk.document).toEqual(doc(120))
  })

  it('a save over a file changed on disk raises a conflict instead of overwriting it', async () => {
    const { editor, autosave, disk, write, conflicts } = await open()
    write(doc(250)) // changed on disk; its event has not arrived yet
    await edit(editor, 120)

    await wait(60)

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).not.toBeNull()
    expect(disk.document).toEqual(doc(250))
    expect(autosave.dirty()).toBe(true)
    await wait(60)
    expect(disk.document).toEqual(doc(250)) // held: not retried on its own
  })

  it('"keep mine" after a refused save writes the editor\'s Document over the file', async () => {
    const { editor, live, disk, write, conflicts } = await open()
    const theirs = write(doc(250))
    await edit(editor, 120)
    await wait(60)

    await conflicts[0]!.keepMine()
    await live.changed(theirs) // the late event of their change

    expect(conflicts.at(-1)).toBeNull()
    expect(disk.document).toEqual(doc(120))
    expect(editor.getDocument()).toEqual(doc(120))
  })

  it('saveNow writes the editor\'s Document over the version it last had', async () => {
    const { editor, live, disk, conflicts } = await open()
    await edit(editor, 120)

    await live.saveNow(editor.getDocument())

    expect(conflicts).toEqual([])
    expect(disk.document).toEqual(doc(120))
  })

  it('saveNow over a file changed on disk raises a conflict and rejects, leaving the file alone', async () => {
    const { editor, live, disk, write, conflicts } = await open()
    write(doc(250)) // changed on disk; its event has not arrived yet
    await edit(editor, 120)

    await expect(live.saveNow(editor.getDocument())).rejects.toBeInstanceOf(SaveConflict)

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).not.toBeNull()
    expect(disk.document).toEqual(doc(250))
  })
})

describe('Inspector edits (update)', () => {
  const inspect = (e: Editor, x: number) => e.update((d) => ({ ...d, layers: [{ ...d.layers[0]!, x }] }), { cause: 'inspector' })

  it('are autosaved over the version last had', async () => {
    const { editor, autosave, disk, conflicts } = await open()

    await inspect(editor, 120)
    await autosave.flush()

    expect(disk.document).toEqual(doc(120))
    expect(disk.hash).toBe('h1')
    expect(conflicts).toEqual([])
  })

  it('raise a conflict instead of overwriting a file changed on disk', async () => {
    const { editor, disk, write, conflicts } = await open()
    write(doc(250)) // changed on disk; its event has not arrived yet

    await inspect(editor, 120)
    await wait(60)

    expect(conflicts).toHaveLength(1)
    expect(disk.document).toEqual(doc(250))
    expect(editor.getDocument()).toEqual(doc(120))
  })
})
