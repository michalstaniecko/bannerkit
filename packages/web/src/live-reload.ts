// Live reload (spec: External change). The server streams `document-changed
// { project, doc, hash }` whenever a Document file changes on disk (GET
// /api/events). `hash` is the content hash the REST read and save also answer
// with, so a change whose hash the editor itself loaded or saved is its own echo
// and is ignored. Any other change:
// - reloads a clean editor silently, through `apply(…, { cause: 'reload' })`, so it
//   is one undo step and history survives (never `load`);
// - when edits are unsaved (waiting or being saved), raises a Conflict and holds
//   autosave, so neither the human's edits nor the change on disk is overwritten
//   until the human picks "reload" or "keep mine".
// Saves go through here too (`save`): each is sent with the hash of the version the
// editor last loaded or saved, and the server refuses it (409) if the file has
// changed since. A refused save raises the same Conflict, so a change on disk is
// never overwritten even when its event has not arrived yet. "Keep mine" saves
// without that precondition.
import type { Document } from '@bannerkit/core'
import type { Autosave } from './autosave.ts'
import type { Editor } from './editor/index.ts'

export type DocumentChanged = { project: string; doc: string; hash: string }

/** The choice offered when a Document changed on disk while the editor had unsaved edits. */
export type Conflict = {
  /** Drops the unsaved edits and shows the Document on disk (one undo step). */
  reload(): Promise<void>
  /** Keeps the editor's Document and saves it over the file on disk. */
  keepMine(): Promise<void>
}

export type LiveReloadOptions = {
  editor: Pick<Editor, 'apply'>
  autosave: Autosave
  /** Reads the open Document from disk, with its content hash. */
  read: () => Promise<{ document: Document; hash: string }>
  /**
   * Writes the open Document. With `expectedHash`, only over that version of the file:
   * a file that has changed since answers `{ conflict: true }` and is left alone.
   */
  write: (document: Document, expectedHash: string | undefined) => Promise<{ hash: string } | { conflict: true }>
  /** A Conflict to show, or null once it is resolved. */
  onConflict: (conflict: Conflict | null) => void
  onError?: (error: unknown) => void
}

export type LiveReload = {
  /** Records the hash of a Document the editor loaded or saved: its echo is ignored. */
  known(hash: string): void
  /**
   * Autosave's save: writes `document` over the version the editor last had. If the
   * file changed since, raises a Conflict and rejects with SaveConflict, so the
   * Document stays unsaved (and held) until the human decides.
   */
  save(document: Document): Promise<void>
  /**
   * Saves `document` now, after autosave has finished (so saves never overlap), with
   * the same precondition as `save`: a file changed on disk raises the Conflict and
   * rejects with SaveConflict. For actions that read the file right after, e.g.
   * "Duplicate to size".
   */
  saveNow(document: Document): Promise<void>
  /** Handles a `document-changed` for the open Document; resolves once handled. */
  changed(hash: string): Promise<void>
}

/** A save refused because the file changed on disk; the Conflict it raised is showing. */
export class SaveConflict extends Error {
  constructor() {
    super('The file changed on disk')
    this.name = 'SaveConflict'
  }
}

/** Own hashes remembered, so a late echo of an older save is still recognised. */
const KNOWN_LIMIT = 50

export function createLiveReload({ editor, autosave, read, write, onConflict, onError = () => {} }: LiveReloadOptions): LiveReload {
  const known: string[] = []
  /** The hash of the Document the editor last showed from (or wrote to) disk. */
  let current: string | undefined
  let conflict: Conflict | null = null
  /** Set by "keep mine": the next save overwrites whatever is on disk. */
  let force = false
  /** Changes are handled one at a time, in order. */
  let queue: Promise<void> = Promise.resolve()

  const remember = (hash: string) => {
    current = hash
    known.push(hash)
    if (known.length > KNOWN_LIMIT) known.shift()
  }

  const reload = async () => {
    const { document, hash } = await read()
    if (hash === current) return
    await editor.apply(document, { cause: 'reload' })
    remember(hash)
  }

  const resolve = () => {
    conflict = null
    autosave.release()
    onConflict(null)
  }

  const raise = () => {
    if (conflict) return
    autosave.hold()
    conflict = {
      reload: async () => {
        if (!conflict) return
        autosave.cancel()
        resolve()
        await reload().catch(onError)
      },
      keepMine: async () => {
        if (!conflict) return
        force = true
        resolve()
        await autosave.flush()
      },
    }
    onConflict(conflict)
  }

  const handle = async (hash: string) => {
    if (known.includes(hash) || conflict) return
    // A save in flight may be what changed the file: its hash is known once it answers.
    await autosave.idle()
    if (known.includes(hash) || conflict) return
    if (autosave.dirty()) return raise()
    await reload()
  }

  const save = async (document: Document) => {
    const result = await write(document, force ? undefined : current)
    if ('conflict' in result) {
      raise()
      throw new SaveConflict()
    }
    force = false
    remember(result.hash)
  }

  return {
    known: remember,
    save,
    async saveNow(document) {
      await autosave.flush()
      if (conflict) throw new SaveConflict()
      await save(document)
    },
    changed(hash) {
      queue = queue.then(() => handle(hash)).catch(onError)
      return queue
    },
  }
}

export type OpenLiveReload = LiveReload & {
  /** Call once the Document is shown, with the hash it was read with: changes are handled from then on. */
  ready(hash: string): void
  /**
   * Resolves once the stream is open (or after CONNECT_TIMEOUT_MS): reading the
   * Document after it means no change on disk falls between the read and the stream.
   */
  connected: Promise<void>
  /** Stops listening. */
  stop(): void
}

const CONNECT_TIMEOUT_MS = 1000

/**
 * Live reload for the open `project`/`doc`: listens to the server's stream from now
 * on (so no change made while the Document loads is missed) and handles its
 * changes once `ready` is called.
 */
export function openLiveReload(ref: { project: string; doc: string }, options: LiveReloadOptions): OpenLiveReload {
  const live = createLiveReload(options)
  let ready: (hash: string) => void = () => {}
  const loaded = new Promise<void>((resolve) => {
    ready = (hash) => {
      live.known(hash)
      resolve()
    }
  })
  let stopped = false
  let open: () => void = () => {}
  const connected = new Promise<void>((resolve) => {
    open = resolve
    setTimeout(resolve, CONNECT_TIMEOUT_MS)
  })
  const unsubscribe = subscribeDocumentChanges((change) => {
    if (change.project !== ref.project || change.doc !== ref.doc) return
    void loaded.then(() => {
      if (!stopped) void live.changed(change.hash)
    })
  }, open)
  return {
    ...live,
    ready,
    connected,
    stop() {
      stopped = true
      unsubscribe()
    },
  }
}

/**
 * Listens to the server's `document-changed` stream; `onOpen` runs when the server
 * says it is watching. Returns a function that closes it. EventSource reconnects on
 * its own after a dropped connection.
 */
export function subscribeDocumentChanges(onChange: (change: DocumentChanged) => void, onOpen: () => void = () => {}): () => void {
  const source = new EventSource('/api/events')
  source.addEventListener('ready', () => onOpen())
  source.addEventListener('document-changed', (event) => {
    onChange(JSON.parse((event as MessageEvent<string>).data) as DocumentChanged)
  })
  return () => source.close()
}
