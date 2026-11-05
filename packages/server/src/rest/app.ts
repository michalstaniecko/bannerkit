// The REST adapter (ADR 0005): a thin Hono app over the operations layer, the
// same ops the CLI calls. It maps OpError to HTTP statuses and never touches
// Documents itself. It also serves Project Assets and, when given `webDir`, the
// built editor, so the editor, the API and the Assets share one origin and
// images never taint the Fabric canvas.
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { readFile } from 'node:fs/promises'
import {
  OpError,
  addAssets,
  createDocument,
  createProject,
  duplicateDocument,
  listDocuments,
  listProjects,
  readDocument,
  readSelection,
  render,
  writeDocument,
  writeSelection,
  type CreateDocumentInput,
  type CreateProjectInput,
  type DuplicateDocumentInput,
  type ExportFile,
  type OpErrorCode,
  type RenderInput,
} from '../ops/index.ts'
import { Name } from '../ops/paths.ts'
import { addLiveRoutes } from './live.ts'

export type AppOptions = {
  /** The projects root. */
  root: string
  /** The built editor (`packages/web/dist`). When omitted, only `/api` is served. */
  webDir?: string
}

const STATUS: Record<OpErrorCode, ContentfulStatusCode> = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  CONFLICT: 409,
  INVALID_DOCUMENT: 422,
  UNSUPPORTED_ASSET: 415,
  RENDER_FAILED: 500,
}

const errorBody = (code: OpErrorCode | 'INTERNAL', message: string) => ({ error: { code, message, issues: [] } })

export function createApp({ root, webDir }: AppOptions) {
  const app = new Hono()
  const api = new Hono()

  api.get('/projects', async (c) => c.json(await listProjects({ root })))

  // POST /projects with `{ name }`: the `createProject` op. Answers 201 with `{ name, path }`.
  api.post('/projects', async (c) => c.json(await createProject({ ...(await jsonObject(c)), root } as CreateProjectInput), 201))

  api.get('/projects/:project/documents', async (c) =>
    c.json(await listDocuments({ root, project: c.req.param('project') })),
  )

  // The editor's read and save. Reading, a missing Asset file is a warning (the editor
  // shows a placeholder and the Document stays editable). Saving, it stays a warning
  // only on a Layer that already had that missing `src` on disk; a newly introduced
  // one is rejected. Everything else is enforced, and a save is validated and written
  // atomically by writeDocument.
  // A save with `If-Match: "<hash>"` (the version the editor last loaded or saved) is
  // written only over that version; otherwise it answers 409 CONFLICT with the file as
  // it is now (`error.current: { document, hash }`). Without If-Match it overwrites.
  api.get('/projects/:project/documents/:doc', async (c) =>
    c.json(await readDocument({ root, project: c.req.param('project'), name: c.req.param('doc'), missingAssets: 'warning' })),
  )

  api.put('/projects/:project/documents/:doc', async (c) => {
    const document = await jsonObject(c)
    const project = c.req.param('project')
    const name = c.req.param('doc')
    const expectedHash = ifMatch(c)
    return c.json(await writeDocument({ root, project, name, document, missingAssets: 'unchanged', expectedHash }))
  })

  // Render (ADR 0005: the same `render` op as `bannerkit render`) --------------------
  // POST /projects/:p/render with `{ docs?, sizes?, format?, scale?, quality? }` batch-renders
  // into the Project's exports folder and answers with the written files.
  // POST /projects/:p/documents/:doc/render with `{ format?, scale?, quality? }` renders one
  // Document the same way and answers with the image itself.
  api.post('/projects/:project/render', async (c) =>
    c.json(await render({ ...(await jsonObject(c, { empty: 'allowed' })), root, project: c.req.param('project') } as RenderInput)),
  )

  api.post('/projects/:project/documents/:doc/render', async (c) => {
    const { format, scale, quality } = (await jsonObject(c, { empty: 'allowed' })) as Omit<RenderInput, 'root' | 'project'>
    const result = await render({ format, scale, quality, root, project: c.req.param('project'), docs: [c.req.param('doc')] })
    const file = result.files[0]!
    return c.body(new Uint8Array(await readFile(file.path)), 200, { 'content-type': RENDER_MIME[file.format] })
  })

  // Selection (the `readSelection`/`writeSelection` ops, the same `.state.json` that
  // `bannerkit inspect` reads) ----------------------------------------------------------
  // GET answers the recorded `{ doc, selectedLayerIds }`, or null when none is.
  // PUT with `{ doc, selectedLayerIds }` replaces it; the editor sends it, debounced.
  api.get('/projects/:project/selection', async (c) => c.json(await readSelection({ root, project: c.req.param('project') })))

  api.put('/projects/:project/selection', async (c) => {
    // Only the two fields are passed on; the op validates them.
    const { doc, selectedLayerIds } = (await jsonObject(c)) as { doc: string; selectedLayerIds: string[] }
    return c.json(await writeSelection({ root, project: c.req.param('project'), doc, selectedLayerIds }))
  })

  // Structure (the editor's toolbar and top bar) ------------------------------------
  // POST /projects/:p/assets, multipart with one or more `file` parts: the `addAssets` op,
  // so added files follow the CLI's ingest rules. Answers 201 with `{ project, assets }`.
  // POST /projects/:p/documents with `{ name, preset | size }`: `createDocument`.
  // POST /projects/:p/documents/:doc/duplicate with `{ name?, preset | size }`: `duplicateDocument`.
  api.post('/projects/:project/assets', async (c) => {
    const form = await c.req.parseBody({ all: true }).catch(() => {
      throw new OpError('INVALID_INPUT', 'The request body is not multipart form data')
    })
    const parts = ([] as unknown[]).concat(form.file ?? [])
    const files = await Promise.all(
      parts
        .filter((part): part is File => part instanceof File)
        .map(async (file) => ({ filename: file.name, data: new Uint8Array(await file.arrayBuffer()) })),
    )
    if (files.length === 0) {
      throw new OpError('INVALID_INPUT', 'No files given', [{ path: 'file', message: 'expected at least one file part' }])
    }
    return c.json(await addAssets({ root, project: c.req.param('project'), files }), 201)
  })

  api.post('/projects/:project/documents', async (c) => {
    const body = await jsonObject(c)
    return c.json(await createDocument({ ...body, root, project: c.req.param('project') } as CreateDocumentInput), 201)
  })

  api.post('/projects/:project/documents/:doc/duplicate', async (c) => {
    const body = await jsonObject(c)
    const input = { ...body, root, project: c.req.param('project'), from: c.req.param('doc') } as DuplicateDocumentInput
    return c.json(await duplicateDocument(input), 201)
  })

  // Assets live at the Document's project-relative `src`: /api/projects/<p>/assets/<file>.
  // serveStatic rejects `..`, `%`-encoded paths and doubled separators.
  api.get(
    '/projects/:project/assets/*',
    async (c, next) => {
      if (!Name.safeParse(c.req.param('project')).success) return notFound(c)
      return next()
    },
    serveStatic({ root, rewriteRequestPath: (path) => path.replace(/^\/api\/projects/, '') }),
    notFound,
  )

  // Live reload: GET /events streams `document-changed { project, doc, hash }` (live.ts).
  addLiveRoutes(api, root)

  api.all('*', notFound)

  api.onError((error, c) => {
    if (error instanceof OpError) return c.json({ error: error.toJSON() }, STATUS[error.code])
    // Anything else escaping an op is a bug: log it, answer without leaking internals.
    console.error(error)
    return c.json(errorBody('INTERNAL', 'Internal server error'), 500)
  })

  app.route('/api', api)
  if (webDir) app.use('*', serveStatic({ root: webDir }))
  return app
}

const RENDER_MIME: Record<ExportFile['format'], string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

/**
 * The request body as a JSON object; the op validates its fields. Bad JSON and
 * anything but an object are INVALID_INPUT. With `empty: 'allowed'` an empty body
 * is `{}` (every field defaulted).
 */
async function jsonObject(c: Context, { empty = 'refused' }: { empty?: 'allowed' | 'refused' } = {}): Promise<Record<string, unknown>> {
  const text = await c.req.text()
  if (empty === 'allowed' && text.trim() === '') return {}
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new OpError('INVALID_INPUT', 'The request body is not valid JSON', [{ path: '', message: 'expected a JSON object' }])
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new OpError('INVALID_INPUT', 'The request body must be a JSON object', [{ path: '', message: 'expected a JSON object' }])
  }
  return body as Record<string, unknown>
}

/** The hash in an `If-Match: "<hash>"` header (quotes optional), or undefined without one. */
function ifMatch(c: Context): string | undefined {
  const value = c.req.header('if-match')?.trim()
  if (!value) return undefined
  return value.replace(/^W\//, '').replace(/^"(.*)"$/, '$1')
}

function notFound(c: Context) {
  return c.json(errorBody('NOT_FOUND', `Nothing at ${c.req.path}`), 404)
}
