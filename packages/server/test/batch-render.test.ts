// S1: the `render` op (Batch Export) against a temporary projects root.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PRESET_IDS } from '@bannerkit/core'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createProject, render, writeDocument } from '../src/ops/index.ts'
import { tempRoot } from './harness.ts'

let root: string
let exports: string
beforeEach(async () => {
  root = await tempRoot()
  exports = join(root, 'p', 'exports')
  await createProject({ root, name: 'p' })
})

const exportedFiles = async () => (await readdir(exports)).filter((f) => !f.startsWith('.')).sort()

describe('render', () => {
  it('exports every Document as PNG at 1× by default, named <doc>.<w>x<h>.png', async () => {
    await createDocument({ root, project: 'p', name: 'hero', preset: '1200x628' })
    await createDocument({ root, project: 'p', name: 'square', preset: '1080x1080' })

    const result = await render({ root, project: 'p' })

    expect(result).toEqual({
      project: 'p',
      files: [
        { name: 'hero', path: join(exports, 'hero.1200x628.png'), width: 1200, height: 628, format: 'png', scale: 1 },
        { name: 'square', path: join(exports, 'square.1080x1080.png'), width: 1080, height: 1080, format: 'png', scale: 1 },
      ],
    })
    expect(await exportedFiles()).toEqual(['hero.1200x628.png', 'square.1080x1080.png'])
  })

  it.each(PRESET_IDS)('writes exact dimensions for the %s Preset at 1× and 2×', async (preset) => {
    await createDocument({ root, project: 'p', name: 'd', preset })
    const [w, h] = preset.split('x').map(Number) as [number, number]

    const [one] = (await render({ root, project: 'p', scale: 1 })).files
    const [two] = (await render({ root, project: 'p', scale: 2 })).files

    expect(one!.path).toBe(join(exports, `d.${preset}.png`))
    expect(two!.path).toBe(join(exports, `d.${preset}@2x.png`))
    const m1 = await sharp(one!.path).metadata()
    const m2 = await sharp(two!.path).metadata()
    expect([m1.width, m1.height]).toEqual([w, h])
    expect([m2.width, m2.height]).toEqual([w * 2, h * 2])
    expect(two).toMatchObject({ width: w * 2, height: h * 2, scale: 2 })
  })

  it('names files by Canvas size, so the extension follows the format', async () => {
    await createDocument({ root, project: 'p', name: 'd', preset: '300x250' })

    const jpg = await render({ root, project: 'p', format: 'jpg', quality: 70 })
    const webp = await render({ root, project: 'p', format: 'webp', scale: 2 })

    expect(jpg.files[0]!.path).toBe(join(exports, 'd.300x250.jpg'))
    expect(webp.files[0]!.path).toBe(join(exports, 'd.300x250@2x.webp'))
    expect((await sharp(jpg.files[0]!.path).metadata()).format).toBe('jpeg')
    expect((await sharp(webp.files[0]!.path).metadata()).format).toBe('webp')
  })

  it('flattens JPEG Exports of a transparent Canvas onto white, and keeps alpha in PNG', async () => {
    await writeDocument({
      root,
      project: 'p',
      name: 'clear',
      document: {
        version: 1,
        name: 'clear',
        canvas: { width: 300, height: 250, background: null },
        layers: [{ id: 'rect-1', type: 'rect', x: 100, y: 100, width: 100, height: 50, fill: '#ff0000' }],
      },
    })

    const [jpg] = (await render({ root, project: 'p', format: 'jpg' })).files
    const [png] = (await render({ root, project: 'p', format: 'png' })).files

    const corner = async (path: string) => {
      const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      return [...data.subarray(0, 4)]
    }
    expect((await sharp(jpg!.path).metadata()).hasAlpha).toBe(false)
    expect((await corner(jpg!.path)).every((v) => v >= 250)).toBe(true)
    expect((await sharp(png!.path).metadata()).hasAlpha).toBe(true)
    expect((await corner(png!.path))[3]).toBe(0)
  })

  it('filters by Document name and by size; filters combine', async () => {
    await createDocument({ root, project: 'p', name: 'a', preset: '300x250' })
    await createDocument({ root, project: 'p', name: 'b', preset: '728x90' })
    await createDocument({ root, project: 'p', name: 'c', preset: '300x250' })

    const names = async (input: object) => (await render({ root, project: 'p', ...input })).files.map((f) => f.name)

    expect(await names({ docs: ['b', 'c'] })).toEqual(['b', 'c'])
    expect(await names({ sizes: [{ width: 300, height: 250 }] })).toEqual(['a', 'c'])
    expect(await names({ sizes: [{ width: 300, height: 250 }, { width: 728, height: 90 }] })).toEqual(['a', 'b', 'c'])
    expect(await names({ docs: ['a', 'b'], sizes: [{ width: 728, height: 90 }] })).toEqual(['b'])
    expect(await names({ sizes: [{ width: 1, height: 1 }] })).toEqual([])
  })

  it('fails with NOT_FOUND naming a --doc filter that matches no Document', async () => {
    await createDocument({ root, project: 'p', name: 'a', preset: '300x250' })

    await expect(render({ root, project: 'p', docs: ['a', 'ghost'] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('ghost'),
    })
    expect(await exportedFiles()).toEqual([])
  })

  it('rejects unsupported format, scale and quality with INVALID_INPUT', async () => {
    await expect(render({ root, project: 'p', format: 'gif' as never })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(render({ root, project: 'p', scale: 3 as never })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(render({ root, project: 'p', quality: 0 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(render({ root, project: 'p', quality: 101 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('fails with NOT_FOUND for a missing Project', async () => {
    await expect(render({ root, project: 'ghost' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
