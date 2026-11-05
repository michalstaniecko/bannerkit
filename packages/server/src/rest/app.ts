// The REST adapter (ADR 0005): a thin Hono app over the operations layer, the
// same ops the CLI calls. It maps OpError to HTTP statuses and never touches
// Documents itself. It also serves Project Assets and, when given `webDir`, the
// built editor, so the editor, the API and the Assets share one origin and
// images never taint the Fabric canvas.
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { OpError, listDocuments, listProjects, readDocument, type OpErrorCode } from '../ops/index.ts'
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

  api.get('/projects/:project/documents/:doc', async (c) =>
    c.json(await readDocument({ root, project: c.req.param('project'), name: c.req.param('doc') })),
  )

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

function notFound(c: Context) {
  return c.json(errorBody('NOT_FOUND', `Nothing at ${c.req.path}`), 404)
}
