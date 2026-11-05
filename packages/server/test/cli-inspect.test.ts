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

  it('fails with a usage hint when no Document is named or selected', async () => {
    const run = await cli(['inspect', 'p', '--root', root, '--json'])
    expect(run.exitCode).toBe(1)
    expect(run.json()).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })
})
