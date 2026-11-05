// watchDocuments: the file watching behind live reload (spec: External change). A
// recursive watcher on the projects root reports every Document file whose bytes
// changed, with the contentHash of those bytes: the same hash readDocument and
// writeDocument answer with, so an editor recognises its own save's echo. The REST
// adapter streams the changes to editors (rest/live.ts).
import { watch, type FSWatcher } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { contentHash } from './fs.ts'
import { Name } from './paths.ts'

export type DocumentChanged = { project: string; doc: string; hash: string }

/** fs.watch reports one write as several events (temp file, rename, change); they settle within this. */
const SETTLE_MS = 50

/** `<project>/documents/<doc>.json` → its names; anything else (temp files, Assets, …) → undefined. */
function documentAt(relative: string): { project: string; doc: string } | undefined {
  const parts = relative.split(sep)
  if (parts.length !== 3 || parts[1] !== 'documents' || !parts[2]!.endsWith('.json')) return undefined
  const project = parts[0]!
  const doc = parts[2]!.slice(0, -'.json'.length)
  if (!Name.safeParse(project).success || !Name.safeParse(doc).success) return undefined
  return { project, doc }
}

/**
 * Watches every Document file under `root` and calls `onChange` once per settled
 * change of its bytes. Duplicate events, unchanged bytes, deletions and files that
 * are not (yet) complete JSON are not reported. Returns a function that stops it.
 */
export function watchDocuments(root: string, onChange: (change: DocumentChanged) => void): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** The last hash reported per file, so a write that changed nothing stays quiet. */
  const reported = new Map<string, string>()
  let closed = false
  // FSEvents (macOS) can replay writes from just before the watcher started; a file
  // last modified before then (including in the same millisecond) is not a change
  // this watcher saw.
  const startedAt = Date.now() + 1

  const check = async (relative: string, ref: { project: string; doc: string }) => {
    let bytes: Buffer
    try {
      if ((await stat(join(root, relative))).mtimeMs < startedAt) return
      bytes = await readFile(join(root, relative))
      JSON.parse(bytes.toString('utf8'))
    } catch {
      return // Deleted, or caught mid-write: the write's next event reports it.
    }
    const hash = contentHash(bytes)
    if (closed || reported.get(relative) === hash) return
    reported.set(relative, hash)
    onChange({ ...ref, hash })
  }

  let watcher: FSWatcher | undefined
  try {
    watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (closed || !filename) return
      const relative = filename.toString()
      const ref = documentAt(relative)
      if (!ref) return
      clearTimeout(timers.get(relative))
      timers.set(
        relative,
        setTimeout(() => {
          timers.delete(relative)
          void check(relative, ref)
        }, SETTLE_MS),
      )
    })
    watcher.on('error', (error) => console.warn('Live reload: watcher failed:', error))
  } catch (error) {
    console.warn(`Live reload: cannot watch ${root}:`, error)
  }

  return () => {
    closed = true
    watcher?.close()
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }
}
