// Starts the Bannerkit server: the REST API, the Project Assets and (when built)
// the editor, all from one origin.
//   tsx src/rest/main.ts [--root <dir>] [--port <n>] [--host <name>]
// Defaults: root from BANNERKIT_ROOT or ./projects (relative to INIT_CWD, the
// directory pnpm was invoked from), port from PORT or 8787, host 127.0.0.1.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { serve } from '@hono/node-server'
import { resolveProjectsRoot } from '../ops/index.ts'
import { createApp } from './app.ts'

export const DEFAULT_PORT = 8787
const webDist = resolve(import.meta.dirname, '../../../web/dist')

const { values } = parseArgs({
  options: { root: { type: 'string' }, port: { type: 'string' }, host: { type: 'string' } },
})

const cwd = process.env.INIT_CWD ?? process.cwd()
const root = resolveProjectsRoot({ root: values.root, env: process.env, cwd })
const port = Number(values.port ?? process.env.PORT ?? DEFAULT_PORT)
const hostname = values.host ?? '127.0.0.1'
const webDir = existsSync(resolve(webDist, 'index.html')) ? webDist : undefined

serve({ fetch: createApp({ root, webDir }).fetch, port, hostname }, (info) => {
  const url = `http://${hostname}:${info.port}`
  console.log(`Bannerkit on ${url} (projects: ${root})`)
  if (!webDir) console.log('Editor not built; serving the API only. Run `pnpm start` or `pnpm dev`.')
})
