import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cli } from './cli-harness.ts'
import { tempRoot } from './harness.ts'

const rect = (id: string, x: number) => ({ id, type: 'rect', x, y: 5, width: 10, height: 10, fill: '#000000' })

/** A Project `p` with a v1 Document `hero` holding `layers` (v1 unless a Group is in them). */
async function heroProject(layers: unknown[] = [rect('rect-1', 0), rect('rect-2', 20), rect('rect-3', 40)]) {
  const root = await tempRoot()
  await cli(['project', 'new', 'p', '--root', root])
  await cli(['doc', 'new', 'p', 'hero', '--size', '100x50', '--root', root])
  const path = join(root, 'p', 'documents', 'hero.json')
  const document = JSON.parse(await readFile(path, 'utf8'))
  const v2 = layers.some((l) => (l as { type: string }).type === 'group')
  await writeFile(path, JSON.stringify({ ...document, version: v2 ? 2 : 1, layers }))
  return { root, path, read: async () => JSON.parse(await readFile(path, 'utf8')) }
}

describe('bannerkit layer group', () => {
  it('wraps the Layers in a new Group, writes the Document as v2 and reports it like doc new plus the id', async () => {
    const { root, path, read } = await heroProject()

    const run = await cli(['layer', 'group', 'p', 'hero', 'rect-3', 'rect-1', '--root', root, '--json'])

    expect(run.exitCode).toBe(0)
    const result = run.json().result
    expect(Object.keys(result).sort()).toEqual(['document', 'hash', 'id', 'name', 'path', 'project', 'warnings'])
    expect(result).toMatchObject({ project: 'p', name: 'hero', path, id: 'group-1', warnings: [] })
    const written = await read()
    expect(written).toEqual(result.document)
    expect(written.version).toBe(2)
    expect(written.layers).toEqual([rect('rect-2', 20), { id: 'group-1', type: 'group', layers: [rect('rect-1', 0), rect('rect-3', 40)] }])
  })

  it('names the Group with --name', async () => {
    const { root, read } = await heroProject()

    await cli(['layer', 'group', 'p', 'hero', 'rect-1', '--name', 'Badge', '--root', root, '--json'])

    expect((await read()).layers[0]).toEqual({ id: 'group-1', type: 'group', name: 'Badge', layers: [rect('rect-1', 0)] })
  })

  it('prints a human-readable line without --json', async () => {
    const { root, path } = await heroProject()

    const run = await cli(['layer', 'group', 'p', 'hero', 'rect-1', 'rect-2', '--root', root])

    expect(run.exitCode).toBe(0)
    expect(run.stdout).toBe(`Grouped rect-1, rect-2 as group-1 in Document hero at ${path}\n`)
  })

  it('fails with NOT_FOUND for an unknown id, without writing', async () => {
    const { root, path } = await heroProject()
    const before = await readFile(path, 'utf8')

    const run = await cli(['layer', 'group', 'p', 'hero', 'rect-1', 'ghost', '--root', root, '--json'])

    expect(run.exitCode).toBe(1)
    expect(run.json().error).toMatchObject({ code: 'NOT_FOUND', message: expect.stringContaining('"ghost"') })
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('fails with INVALID_INPUT for Layers with different parents, without writing', async () => {
    const { root, path } = await heroProject([rect('rect-1', 0), { id: 'group-1', type: 'group', layers: [rect('rect-2', 20)] }])
    const before = await readFile(path, 'utf8')

    const run = await cli(['layer', 'group', 'p', 'hero', 'rect-1', 'rect-2', '--root', root, '--json'])

    expect(run.exitCode).toBe(1)
    expect(run.json().error.code).toBe('INVALID_INPUT')
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('needs at least one id', async () => {
    const { root } = await heroProject()

    const run = await cli(['layer', 'group', 'p', 'hero', '--root', root, '--json'])

    expect(run.exitCode).toBe(2)
    expect(run.json().error.code).toBe('USAGE')
  })
})

describe('bannerkit layer ungroup', () => {
  const grouped = () =>
    heroProject([rect('rect-1', 0), { id: 'group-1', type: 'group', opacity: 0.5, layers: [rect('rect-2', 20), rect('rect-3', 40)] }])

  it('puts the children where the Group was and reports it like doc new plus their ids', async () => {
    const { root, path, read } = await grouped()

    const run = await cli(['layer', 'ungroup', 'p', 'hero', 'group-1', '--root', root, '--json'])

    expect(run.exitCode).toBe(0)
    const result = run.json().result
    expect(Object.keys(result).sort()).toEqual(['document', 'hash', 'ids', 'name', 'path', 'project', 'warnings'])
    expect(result).toMatchObject({ project: 'p', name: 'hero', path, ids: ['rect-2', 'rect-3'] })
    const written = await read()
    expect(written).toEqual(result.document)
    expect(written.version).toBe(2)
    expect(written.layers).toEqual([rect('rect-1', 0), rect('rect-2', 20), rect('rect-3', 40)])
  })

  it('prints a human-readable line without --json', async () => {
    const { root, path } = await grouped()

    const run = await cli(['layer', 'ungroup', 'p', 'hero', 'group-1', '--root', root])

    expect(run.exitCode).toBe(0)
    expect(run.stdout).toBe(`Ungrouped into rect-2, rect-3 in Document hero at ${path}\n`)
  })

  it('fails with INVALID_INPUT for a Layer that is not a Group, and NOT_FOUND for an unknown id', async () => {
    const { root, path } = await grouped()
    const before = await readFile(path, 'utf8')

    const notGroup = await cli(['layer', 'ungroup', 'p', 'hero', 'rect-1', '--root', root, '--json'])
    const unknown = await cli(['layer', 'ungroup', 'p', 'hero', 'ghost', '--root', root, '--json'])

    expect(notGroup.json().error.code).toBe('INVALID_INPUT')
    expect(unknown.json().error.code).toBe('NOT_FOUND')
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('fails with NOT_FOUND for a missing Document', async () => {
    const { root } = await grouped()

    const run = await cli(['layer', 'ungroup', 'p', 'ghost', 'group-1', '--root', root, '--json'])

    expect(run.exitCode).toBe(1)
    expect(run.json().error.code).toBe('NOT_FOUND')
  })
})
