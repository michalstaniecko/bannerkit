import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PRESET_IDS } from '@bannerkit/core'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createProject, preview, writeDocument } from '../src/ops/index.ts'
import { tempRoot } from './harness.ts'

let root: string
beforeEach(async () => {
  root = await tempRoot()
  await createProject({ root, name: 'p' })
})

async function pixels(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * 4
    return [data[i], data[i + 1], data[i + 2], data[i + 3]]
  }
  return { width: info.width, height: info.height, at }
}

describe('preview', () => {
  it('renders the Canvas background and solid rect Layers to exports/.preview/<doc>.png', async () => {
    await writeDocument({
      root,
      project: 'p',
      name: 'hero',
      document: {
        version: 1,
        name: 'hero',
        canvas: { width: 300, height: 250, background: '#0000ff' },
        layers: [
          { id: 'rect-1', type: 'rect', x: 20, y: 20, width: 100, height: 100, fill: '#ff0000' },
          // Stacked above rect-1: later Layers draw on top.
          { id: 'rect-2', type: 'rect', x: 70, y: 70, width: 100, height: 100, fill: '#00ff00' },
        ],
      },
    })

    const result = await preview({ root, project: 'p', name: 'hero' })

    expect(result.path).toBe(join(root, 'p', 'exports', '.preview', 'hero.png'))
    expect(result).toMatchObject({ width: 300, height: 250 })
    const img = await pixels(result.path)
    expect([img.width, img.height]).toEqual([300, 250])
    expect(img.at(5, 5)).toEqual([0, 0, 255, 255])
    expect(img.at(40, 40)).toEqual([255, 0, 0, 255])
    expect(img.at(100, 100)).toEqual([0, 255, 0, 255])
    expect(img.at(250, 200)).toEqual([0, 0, 255, 255])
  })

  it('downsamples a 2× render, so a half-pixel edge blends instead of snapping', async () => {
    await writeDocument({
      root,
      project: 'p',
      name: 'edge',
      document: {
        version: 1,
        name: 'edge',
        canvas: { width: 20, height: 20, background: '#000000' },
        layers: [{ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 10.5, height: 20, fill: '#ffffff' }],
      },
    })

    const img = await pixels((await preview({ root, project: 'p', name: 'edge' })).path)

    expect(img.at(5, 10)).toEqual([255, 255, 255, 255])
    expect(img.at(15, 10)).toEqual([0, 0, 0, 255])
    const [edge] = img.at(10, 10)
    expect(edge).toBeGreaterThan(64)
    expect(edge).toBeLessThan(192)
  })

  it.each(PRESET_IDS)('produces exact dimensions for the %s Preset', async (preset) => {
    await createDocument({ root, project: 'p', name: 'd', preset })

    const result = await preview({ root, project: 'p', name: 'd' })

    const meta = await sharp(result.path).metadata()
    expect(`${meta.width}x${meta.height}`).toBe(preset)
    expect(meta.format).toBe('png')
  })

  it('overwrites the previous Preview atomically', async () => {
    await createDocument({ root, project: 'p', name: 'd', preset: '300x250' })
    await preview({ root, project: 'p', name: 'd' })
    await preview({ root, project: 'p', name: 'd' })

    expect(await readdir(join(root, 'p', 'exports', '.preview'))).toEqual(['d.png'])
  })

  it('fails with NOT_FOUND for a missing Document', async () => {
    await expect(preview({ root, project: 'p', name: 'ghost' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
