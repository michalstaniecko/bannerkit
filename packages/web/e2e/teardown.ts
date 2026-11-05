import { rmSync } from 'node:fs'
import { E2E_ROOT_ENV } from './root.ts'

/** Removes the run's temporary projects root. */
export default function teardown() {
  const root = process.env[E2E_ROOT_ENV]
  if (root) rmSync(root, { recursive: true, force: true })
}
