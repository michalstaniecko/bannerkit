import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cli } from './cli-harness.ts'
import { seededRoot, tempRoot } from './harness.ts'

const docPath = (root: string, name: string) => join(root, 'demo', 'documents', `${name}.json`)
const readDoc = async (root: string, name: string) => JSON.parse(await readFile(docPath(root, name), 'utf8'))

/** The demo Project with one v1 Document (hero), v2 ones (story, and square made v2 here) and an invalid v1 (broken). */
async function mixedProject(): Promise<string> {
  const root = await seededRoot()
  const square = await readDoc(root, 'square')
  await writeFile(docPath(root, 'square'), `${JSON.stringify({ ...square, version: 2 }, null, 2)}\n`)
  const hero = await readDoc(root, 'hero')
  await writeFile(docPath(root, 'broken'), JSON.stringify({ ...hero, name: 'broken', guides: { x: [], y: [] } }))
  return root
}

describe('bannerkit migrate', () => {
  it('lifts valid v1 Documents to v2, leaves v2 ones alone and reports invalid ones without writing them', async () => {
    const root = await mixedProject()
    const square = await readFile(docPath(root, 'square'))
    const broken = await readFile(docPath(root, 'broken'))

    const run = await cli(['migrate', 'demo', '--root', root, '--json'])

    expect(run.exitCode).toBe(1)
    expect(run.json()).toEqual({
      ok: false,
      result: {
        project: 'demo',
        migrated: [
          { name: 'hero', path: docPath(root, 'hero') },
          { name: 'rectangle', path: docPath(root, 'rectangle') },
        ],
        unchanged: [
          { name: 'square', path: docPath(root, 'square') },
          { name: 'story', path: docPath(root, 'story') },
        ],
        invalid: [
          {
            name: 'broken',
            path: docPath(root, 'broken'),
            errors: [{ path: 'guides', message: '"guides" requires version: 2; run `bannerkit migrate`' }],
          },
        ],
      },
    })
    expect(await readFile(docPath(root, 'square'))).toEqual(square)
    expect(await readFile(docPath(root, 'broken'))).toEqual(broken)
  })

  it('changes only the version, keeping $schema and every Layer', async () => {
    const root = await seededRoot()
    const before = await readDoc(root, 'hero')

    const run = await cli(['migrate', 'demo', '--root', root, '--json'])

    expect(run.exitCode).toBe(0)
    expect(await readDoc(root, 'hero')).toEqual({ ...before, version: 2 })
  })

  it('is idempotent', async () => {
    const root = await seededRoot()
    await cli(['migrate', 'demo', '--root', root])
    const after = await readFile(docPath(root, 'hero'))

    const again = await cli(['migrate', 'demo', '--root', root, '--json'])

    expect(again.exitCode).toBe(0)
    expect(again.json().result.migrated).toEqual([])
    expect(again.json().result.unchanged.map((d: { name: string }) => d.name)).toContain('hero')
    expect(await readFile(docPath(root, 'hero'))).toEqual(after)
  })

  it('prints what it did without --json', async () => {
    const root = await mixedProject()

    const run = await cli(['migrate', 'demo', '--root', root])

    expect(run.exitCode).toBe(1)
    expect(run.stdout).toContain(`migrated ${docPath(root, 'hero')}`)
    expect(run.stdout).toContain(`invalid ${docPath(root, 'broken')}`)
    expect(run.stdout).toContain('guides: "guides" requires version: 2')
    expect(run.stdout).toContain('2 migrated, 2 unchanged, 1 invalid')
  })

  it('fails with NOT_FOUND for a missing Project', async () => {
    const run = await cli(['migrate', 'nope', '--root', await tempRoot(), '--json'])

    expect(run.exitCode).toBe(1)
    expect(run.json().error.code).toBe('NOT_FOUND')
  })
})
