import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createProject, writeDocument, writeSelection } from '../src/ops/index.ts'
import { cli } from './cli-harness.ts'
import { tempRoot } from './harness.ts'

let root: string
beforeEach(async () => {
  root = await tempRoot()
  await createProject({ root, name: 'p' })
  await writeDocument({
    root,
    project: 'p',
    name: 'hero',
    document: {
      version: 1,
      name: 'hero',
      canvas: { width: 300, height: 250, background: '#ffffff' },
      layers: [
        { id: 'rect-1', type: 'rect', x: 250, y: 0, width: 100, height: 50, fill: '#ff0000' },
        {
          id: 'text-1',
          type: 'text',
          x: 10,
          y: 10,
          width: 200,
          text: 'Hi',
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize: 20,
          fill: '#000000',
        },
      ],
    },
  })
})

describe('bannerkit inspect', () => {
  it('--json prints the stable inspect shape', async () => {
    await writeSelection({ root, project: 'p', doc: 'hero', selectedLayerIds: ['text-1'] })

    const run = await cli(['inspect', 'p', 'hero', '--root', root, '--json'])

    expect(run.exitCode).toBe(0)
    // A single text line is fontSize × 1.13 tall (Fabric's line metrics).
    const lineHeight = expect.closeTo(20 * 1.13, 6)
    expect(run.json()).toEqual({
      ok: true,
      result: {
        project: 'p',
        name: 'hero',
        path: join(root, 'p', 'documents', 'hero.json'),
        canvas: { width: 300, height: 250 },
        selection: { doc: 'hero', selectedLayerIds: ['text-1'] },
        layers: [
          {
            index: 0,
            id: 'rect-1',
            type: 'rect',
            extent: { x: 250, y: 0, width: 100, height: 50 },
            placement: 'partial',
            selected: false,
          },
          {
            index: 1,
            id: 'text-1',
            type: 'text',
            extent: { x: 10, y: 10, width: 200, height: lineHeight },
            placement: 'inside',
            selected: true,
            text: {
              fontSize: 20,
              requestedFontSize: 20,
              height: lineHeight,
              overflow: false,
              lines: [{ text: 'Hi', width: expect.any(Number) }],
            },
          },
        ],
        warnings: [{ path: 'layers[0]', message: 'Layer "rect-1" is partly outside the Canvas' }],
      },
    })
  })

  it('defaults to the selected Document and prints a readable report', async () => {
    await writeSelection({ root, project: 'p', doc: 'hero', selectedLayerIds: ['text-1'] })

    const run = await cli(['inspect', 'p', '--root', root])

    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain('hero 300x250')
    expect(run.stdout).toContain('Selection: text-1')
    expect(run.stdout).toMatch(/\* \[1\] text text-1 .*inside/)
    expect(run.stdout).toContain('20px, 1 line(s): "Hi"')
    expect(run.stdout).toContain('warning layers[0]: Layer "rect-1" is partly outside the Canvas')
  })

  it('indents Group children by depth and marks a selected Group', async () => {
    const rect = (id: string, x: number) => ({ id, type: 'rect', x, y: 0, width: 10, height: 10, fill: '#ff0000' })
    await writeDocument({
      root,
      project: 'p',
      name: 'hero',
      document: {
        version: 2,
        name: 'hero',
        canvas: { width: 300, height: 250, background: '#ffffff' },
        layers: [
          rect('rect-1', 0),
          { id: 'group-1', type: 'group', name: 'Badge', layers: [rect('rect-2', 20), { id: 'group-2', type: 'group', layers: [rect('rect-3', 40)] }] },
        ],
      },
    })
    await writeSelection({ root, project: 'p', doc: 'hero', selectedLayerIds: ['group-1'] })

    const run = await cli(['inspect', 'p', '--root', root])

    expect(run.exitCode).toBe(0)
    const lines = run.stdout.split('\n')
    expect(lines).toContain('  [0] rect rect-1 at 0,0 10x10 inside')
    expect(lines).toContain('* [1] group group-1 "Badge" at 20,0 30x10 inside')
    expect(lines).toContain('    [0] rect rect-2 at 20,0 10x10 inside')
    expect(lines).toContain('    [1] group group-2 at 40,0 10x10 inside')
    expect(lines).toContain('      [0] rect rect-3 at 40,0 10x10 inside')
  })

  it('fails with a usage hint when no Document is named or selected', async () => {
    const run = await cli(['inspect', 'p', '--root', root, '--json'])
    expect(run.exitCode).toBe(1)
    expect(run.json()).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })
})
