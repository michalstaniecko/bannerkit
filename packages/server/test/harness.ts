// S1 harness: every operations-layer test runs against its own temporary
// projects root, seeded from the committed examples/ Projects when they exist.
import { cp, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { onTestFinished } from 'vitest'

export const repoRoot = resolve(import.meta.dirname, '../../..')
export const examplesDir = join(repoRoot, 'examples')

/** Creates an empty temporary projects root, removed when the test finishes. */
export async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bannerkit-s1-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

/** Creates a temporary projects root holding a copy of every Project in examples/. */
export async function seededRoot(): Promise<string> {
  const root = await tempRoot()
  if (await exists(examplesDir)) await cp(examplesDir, root, { recursive: true })
  return root
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Lists a directory recursively as sorted, root-relative paths (directories end in `/`). */
export async function tree(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .map((e) => {
      const rel = join(e.parentPath, e.name).slice(dir.length + 1)
      return e.isDirectory() ? `${rel}/` : rel
    })
    .sort()
}
