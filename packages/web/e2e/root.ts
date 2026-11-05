// The S3 projects root: one temporary directory per `pnpm test:e2e` run, seeded
// with a copy of every committed Project in examples/. The config creates it in the
// runner process and publishes it through an env var, which the test workers
// (forked from the runner) and the servers inherit, so all of them see the same root.
import { cpSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const E2E_ROOT_ENV = 'BANNERKIT_E2E_ROOT'
export const repoRoot = resolve(import.meta.dirname, '../../..')

/** The run's projects root, created (and seeded from examples/) on first call. */
export function projectsRoot(): string {
  const existing = process.env[E2E_ROOT_ENV]
  if (existing) return existing
  const root = mkdtempSync(join(tmpdir(), 'bannerkit-s3-'))
  const examples = join(repoRoot, 'examples')
  if (existsSync(examples)) cpSync(examples, root, { recursive: true })
  process.env[E2E_ROOT_ENV] = root
  return root
}
