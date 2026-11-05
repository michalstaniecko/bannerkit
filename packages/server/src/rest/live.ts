// Live reload (spec: SSE): GET /api/events streams the `watchDocuments` op's changes
// to editors as `document-changed { project, doc, hash }`.
//
// The watcher runs only while at least one editor is listening: the first stream
// starts it and the last one to close stops it, so a server (or a test) with no
// open streams holds no file-system handles.
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { watchDocuments, type DocumentChanged } from '../ops/index.ts'

/** Keeps idle proxies and browsers from dropping a quiet stream. */
const HEARTBEAT_MS = 15_000

/** Adds GET /events (the `document-changed` stream) to the `/api` app. */
export function addLiveRoutes(api: Hono, root: string): void {
  const listeners = new Set<(change: DocumentChanged) => void>()
  let stop: (() => void) | undefined

  const subscribe = (listener: (change: DocumentChanged) => void) => {
    listeners.add(listener)
    stop ??= watchDocuments(root, (change) => {
      for (const l of listeners) l(change)
    })
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        stop?.()
        stop = undefined
      }
    }
  }

  api.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      let unsubscribe = () => {}
      const done = new Promise<void>((resolve) => {
        stream.onAbort(resolve)
        unsubscribe = subscribe((change) => {
          void stream.writeSSE({ event: 'document-changed', data: JSON.stringify(change) })
        })
      })
      const heartbeat = setInterval(() => void stream.write(': ping\n\n'), HEARTBEAT_MS)
      try {
        // Tells the client the stream is open (and so the watcher is running).
        await stream.writeSSE({ event: 'ready', data: '{}' })
        await done
      } finally {
        clearInterval(heartbeat)
        unsubscribe()
      }
    }),
  )
}
