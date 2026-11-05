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
  listDocuments,
  listProjects,
  readDocument,
  render,
  writeDocument,
  type ExportFile,
  type OpErrorCode,
  type RenderInput,
} from '../ops/index.ts'
import { Name } from '../ops/paths.ts'

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
  INVALID_DOCUMENT: 422,
  UNSUPPORTED_ASSET: 415,
  RENDER_FAILED: 500,
}

const errorBody = (code: OpErrorCode | 'INTERNAL', message: string) => ({ error: { code, message, issues: [] } })

export function createApp({ root, webDir }: AppOptions) {
  const app = new Hono()
  const api = new Hono()

  api.get('/projects', async (c) => c.json(await listProjects({ root })))

  api.get('/projects/:project/documents', async (c) =>
    c.json(await listDocuments({ root, project: c.req.param('project') })),
  )

  // The editor's read and save: a missing Asset file is a warning (the editor shows a
  // placeholder and the Document stays editable), not a rejection. Everything else is
  // enforced, and a save is validated and written atomically by writeDocument.
  api.get('/projects/:project/documents/:doc', async (c) =>
    c.json(await readDocument({ root, project: c.req.param('project'), name: c.req.param('doc'), missingAssets: 'warning' })),
  )

  api.put('/projects/:project/documents/:doc', async (c) => {
    const document = await c.req.json().catch(() => {
      throw new OpError('INVALID_INPUT', 'The request body is not valid JSON')
    })
    const project = c.req.param('project')
    const name = c.req.param('doc')
    return c.json(await writeDocument({ root, project, name, document, missingAssets: 'warning' }))
  })

  // Render (ADR 0005: the same `render` op as `bannerkit render`) --------------------
  // POST /projects/:p/render with `{ docs?, sizes?, format?, scale?, quality? }` batch-renders
  // into the Project's exports folder and answers with the written files.
  // POST /projects/:p/documents/:doc/render with `{ format?, scale?, quality? }` renders one
  // Document the same way and answers with the image itself.
  api.post('/projects/:project/render', async (c) =>
    c.json(await render({ ...(await renderOptions(c)), root, project: c.req.param('project') })),
  )

  api.post('/projects/:project/documents/:doc/render', async (c) => {
    const { format, scale, quality } = await renderOptions(c)
    const result = await render({ format, scale, quality, root, project: c.req.param('project'), docs: [c.req.param('doc')] })
    const file = result.files[0]!
    return c.body(new Uint8Array(await readFile(file.path)), 200, { 'content-type': RENDER_MIME[file.format] })
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

/** A render request's JSON body (empty → defaults). The op validates the fields. */
async function renderOptions(c: Context): Promise<Omit<RenderInput, 'root' | 'project'>> {
  const text = await c.req.text()
  if (text.trim() === '') return {}
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new OpError('INVALID_INPUT', 'Request body is not valid JSON', [{ path: '', message: 'expected a JSON object' }])
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new OpError('INVALID_INPUT', 'Request body must be a JSON object', [{ path: '', message: 'expected a JSON object' }])
  }
  return body as Omit<RenderInput, 'root' | 'project'>
}

function notFound(c: Context) {
  return c.json(errorBody('NOT_FOUND', `Nothing at ${c.req.path}`), 404)
}
