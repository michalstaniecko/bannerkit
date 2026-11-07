import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readDocument } from '../src/ops/index.ts'
import { cli } from './cli-harness.ts'
import { tempRoot } from './harness.ts'

const rect = (id: string, x: number, y = 5) => ({ id, type: 'rect', x, y, width: 10, height: 10, fill: '#000000' })

/** A Project `p` with a v1 Document `hero` (100×50) holding `layers` (v1 unless a Group is in them). */
async function heroProject(layers: unknown[] = [rect('rect-1', 0), rect('rect-2', 20, 15), rect('rect-3', 60, 30)]) {
  const root = await tempRoot()
  await cli(['project', 'new', 'p', '--root', root])
  await cli(['doc', 'new', 'p', 'hero', '--size', '100x50', '--root', root])
  const path = join(root, 'p', 'documents', 'hero.json')
  const document = JSON.parse(await readFile(path, 'utf8'))
  const v2 = layers.some((l) => (l as { type: string }).type === 'group')
  await writeFile(path, JSON.stringify({ ...document, version: v2 ? 2 : 1, layers }))
  return { root, path, read: async () => JSON.parse(await readFile(path, 'utf8')) }
}

const RESULT_KEYS = ['document', 'hash', 'moved', 'name', 'path', 'project', 'warnings']

describe('bannerkit layer align', () => {
  it('aligns the Layers to their Selection Box, writes the Document as v2 and reports it like layer group plus moved', async () => {
    const { root, path, read } = await heroProject()

    const run = await cli(['layer', 'align', 'p', 'hero', 'rect-3', 'rect-2', 'rect-1', '--edge', 'top', '--root', root, '--json'])

    expect(run.exitCode).toBe(0)
    const result = run.json().result
    expect(Object.keys(result).sort()).toEqual(RESULT_KEYS)
    expect(result).toMatchObject({ project: 'p', name: 'hero', path, warnings: [], moved: ['rect-3', 'rect-2'] })
    const written = await read()
    expect(written).toEqual(result.document)
    expect(written.version).toBe(2)
    expect(written.layers).toEqual([rect('rect-1', 0), rect('rect-2', 20, 5), rect('rect-3', 60, 5)])
  })

  it('centres a Layer on the Canvas with --edge hcenter --edge vcenter --to canvas', async () => {
    const { root, read } = await heroProject()

    const run = await cli(
      ['layer', 'align', 'p', 'hero', 'rect-1', 'rect-2', '--edge', 'hcenter', '--edge', 'vcenter', '--to', 'canvas', '--root', root, '--json'],
    )

    expect(run.exitCode).toBe(0)
    expect(run.json().result.moved).toEqual(['rect-1', 'rect-2'])
    expect((await read()).layers.slice(0, 2)).toEqual([rect('rect-1', 45, 20), rect('rect-2', 45, 20)])
  })

  it('writes nothing when no Layer moves: moved is empty, the hash is the file on disk and v1 stays v1', async () => {
    const { root, path } = await heroProject()
    const before = await readFile(path, 'utf8')
    const { hash } = await readDocument({ root, project: 'p', name: 'hero' })

    const run = await cli(['layer', 'align', 'p', 'hero', 'rect-1', '--edge', 'left', '--root', root, '--json'])

    expect(run.exitCode).toBe(0)
    const result = run.json().result
    expect(Object.keys(result).sort()).toEqual(RESULT_KEYS)
    expect(result).toMatchObject({ moved: [], hash })
    expect(await readFile(path, 'utf8')).toBe(before)
    expect(JSON.parse(before).version).toBe(1)
  })

  it('prints a human-readable line without --json', async () => {
    const { root, path } = await heroProject()

    const moved = await cli(['layer', 'align', 'p', 'hero', 'rect-2', '--edge', 'left', '--root', root])
    const still = await cli(['layer', 'align', 'p', 'hero', 'rect-1', '--edge', 'left', '--root', root])

    expect(moved.stdout).toBe(`Moved rect-2 in Document hero at ${path}\n`)
    expect(still.stdout).toBe(`Nothing moved in Document hero at ${path}\n`)
  })

  it('fails with NOT_FOUND for an unknown id and INVALID_INPUT for a Layer with its Group, without writing', async () => {
    const { root, path } = await heroProject([rect('rect-1', 0), { id: 'group-1', type: 'group', layers: [rect('rect-2', 20)] }])
    const before = await readFile(path, 'utf8')

    const unknown = await cli(['layer', 'align', 'p', 'hero', 'rect-1', 'ghost', '--edge', 'left', '--root', root, '--json'])
    const nested = await cli(['layer', 'align', 'p', 'hero', 'group-1', 'rect-2', '--edge', 'left', '--root', root, '--json'])

    expect(unknown.exitCode).toBe(1)
    expect(unknown.json().error).toMatchObject({ code: 'NOT_FOUND', message: expect.stringContaining('"ghost"') })
    expect(nested.exitCode).toBe(1)
    expect(nested.json().error.code).toBe('INVALID_INPUT')
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('is a usage error with the closest value for a typo in --edge or --to', async () => {
    const { root } = await heroProject()

    const edge = await cli(['layer', 'align', 'p', 'hero', 'rect-1', '--edge', 'lfet', '--root', root, '--json'])
    const to = await cli(['layer', 'align', 'p', 'hero', 'rect-1', '--edge', 'left', '--to', 'canvs', '--root', root, '--json'])

    expect(edge.exitCode).toBe(2)
    expect(edge.json().error).toMatchObject({ code: 'USAGE', message: expect.stringContaining('did you mean "left"?') })
    expect(to.exitCode).toBe(2)
    expect(to.json().error).toMatchObject({ code: 'USAGE', message: expect.stringContaining('did you mean "canvas"?') })
  })

  it('is a usage error without --edge, with two edges on one axis, or without ids', async () => {
    const { root } = await heroProject()

    const runs = await Promise.all([
      cli(['layer', 'align', 'p', 'hero', 'rect-1', '--root', root, '--json']),
      cli(['layer', 'align', 'p', 'hero', 'rect-1', '--edge', 'left', '--edge', 'right', '--root', root, '--json']),
      cli(['layer', 'align', 'p', 'hero', 'rect-1', '--edge', 'top', '--edge', 'bottom', '--root', root, '--json']),
      cli(['layer', 'align', 'p', 'hero', '--edge', 'left', '--root', root, '--json']),
    ])

    for (const run of runs) {
      expect(run.exitCode).toBe(2)
      expect(run.json().error.code).toBe('USAGE')
    }
  })
})

describe('bannerkit layer distribute', () => {
  it('spaces the Layers equally, writes v2 and reports it like layer align', async () => {
    const { root, path, read } = await heroProject([rect('rect-1', 0), rect('rect-2', 50), rect('rect-3', 15)])

    const run = await cli(['layer', 'distribute', 'p', 'hero', 'rect-2', 'rect-3', 'rect-1', '--axis', 'x', '--root', root, '--json'])

    expect(run.exitCode).toBe(0)
    const result = run.json().result
    expect(Object.keys(result).sort()).toEqual(RESULT_KEYS)
    expect(result).toMatchObject({ project: 'p', name: 'hero', path, moved: ['rect-3'] })
    const written = await read()
    expect(written).toEqual(result.document)
    expect(written.version).toBe(2)
    expect(written.layers).toEqual([rect('rect-1', 0), rect('rect-2', 50), rect('rect-3', 25)])
  })

  it('puts --gap px between the Layers on --axis y', async () => {
    const { root, read } = await heroProject([rect('rect-1', 0, 0), rect('rect-2', 0, 40)])

    const run = await cli(['layer', 'distribute', 'p', 'hero', 'rect-1', 'rect-2', '--axis', 'y', '--gap', '4', '--root', root, '--json'])

    expect(run.json().result.moved).toEqual(['rect-2'])
    expect((await read()).layers).toEqual([rect('rect-1', 0, 0), rect('rect-2', 0, 14)])
  })

  it('writes nothing when the Layers are already spaced', async () => {
    const { root, path } = await heroProject([rect('rect-1', 0), rect('rect-2', 20), rect('rect-3', 40)])
    const before = await readFile(path, 'utf8')

    const run = await cli(['layer', 'distribute', 'p', 'hero', 'rect-1', 'rect-2', 'rect-3', '--axis', 'x', '--root', root, '--json'])

    expect(run.json().result.moved).toEqual([])
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('fails with INVALID_INPUT for too few Layers and NOT_FOUND for an unknown id', async () => {
    const { root } = await heroProject()

    const even = await cli(['layer', 'distribute', 'p', 'hero', 'rect-1', 'rect-2', '--axis', 'x', '--root', root, '--json'])
    const gap = await cli(['layer', 'distribute', 'p', 'hero', 'rect-1', '--axis', 'x', '--gap', '2', '--root', root, '--json'])
    const unknown = await cli(['layer', 'distribute', 'p', 'hero', 'rect-1', 'rect-2', 'ghost', '--axis', 'x', '--root', root, '--json'])

    expect([even.exitCode, gap.exitCode, unknown.exitCode]).toEqual([1, 1, 1])
    expect([even.json().error.code, gap.json().error.code, unknown.json().error.code]).toEqual(['INVALID_INPUT', 'INVALID_INPUT', 'NOT_FOUND'])
  })

  it('is a usage error for a typo in --axis, a missing --axis or a --gap that is not a whole number', async () => {
    const { root } = await heroProject()
    const ids = ['rect-1', 'rect-2', 'rect-3']

    const typo = await cli(['layer', 'distribute', 'p', 'hero', ...ids, '--axis', 'xx', '--root', root, '--json'])
    const missing = await cli(['layer', 'distribute', 'p', 'hero', ...ids, '--root', root, '--json'])
    const fraction = await cli(['layer', 'distribute', 'p', 'hero', ...ids, '--axis', 'x', '--gap', '1.5', '--root', root, '--json'])

    expect(typo.exitCode).toBe(2)
    expect(typo.json().error).toMatchObject({ code: 'USAGE', message: expect.stringContaining('did you mean "x"?') })
    expect([missing.exitCode, fraction.exitCode]).toEqual([2, 2])
  })
})
