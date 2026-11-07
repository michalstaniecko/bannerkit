// The output stage of renderDocument: scale, format and quality (ADR 0006).
import type { Document, Layer } from '@bannerkit/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { renderDocument } from '../src/render/renderDocument.ts'

function doc(layers: Layer[], background: string | null, width = 100, height = 50): Document {
  return { version: 2, name: 'test', canvas: { width, height, background }, layers }
}

async function decode(image: Buffer) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * 4
    return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
  }
  return { at, meta: await sharp(image).metadata() }
}

function near(actual: number[], expected: number[], tol = 4) {
  expect(actual.every((v, i) => Math.abs(v - expected[i]!) <= tol), `${actual} ≈ ${expected}`).toBe(true)
}

const redBox: Layer = { id: 'rect-1', type: 'rect', x: 25, y: 10, width: 50, height: 30, fill: '#ff0000' }

describe('renderDocument output', () => {
  it('flattens a transparent Canvas onto white for JPEG', async () => {
    const jpg = await renderDocument(doc([redBox], null), { format: 'jpg' })

    const { at, meta } = await decode(jpg)
    expect(meta.format).toBe('jpeg')
    expect(meta.hasAlpha).toBe(false)
    near(at(5, 5), [255, 255, 255, 255])
    near(at(50, 25), [255, 0, 0, 255], 8)
  })

  it('flattens JPEG onto an opaque Canvas background, not black', async () => {
    const jpg = await renderDocument(doc([], '#00ff00'), { format: 'jpg' })

    near((await decode(jpg)).at(5, 5), [0, 255, 0, 255], 8)
  })

  it('keeps alpha in PNG on a transparent Canvas', async () => {
    const png = await renderDocument(doc([redBox], null), { format: 'png' })

    const { at, meta } = await decode(png)
    expect(meta.format).toBe('png')
    expect(meta.hasAlpha).toBe(true)
    expect(at(5, 5)[3]).toBe(0)
    near(at(50, 25), [255, 0, 0, 255], 1)
  })

  it('encodes WebP with alpha', async () => {
    const webp = await renderDocument(doc([redBox], null), { format: 'webp' })

    const { at, meta } = await decode(webp)
    expect(meta.format).toBe('webp')
    expect(at(5, 5)[3]).toBe(0)
    near(at(50, 25), [255, 0, 0, 255], 8)
  })

  it('applies quality to lossy formats', async () => {
    const gradient: Layer = {
      id: 'rect-1',
      type: 'rect',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      fill: { type: 'linear', angle: 45, stops: [['#ff0000', 0], ['#00ff00', 0.5], ['#0000ff', 1]] },
      rotation: 10,
    }
    const busy = doc([gradient, { ...redBox, rotation: 33, cornerRadius: 9 }], '#ffffff', 400, 300)
    for (const format of ['jpg', 'webp'] as const) {
      const low = await renderDocument(busy, { format, quality: 10 })
      const high = await renderDocument(busy, { format, quality: 100 })
      expect(low.length, format).toBeLessThan(high.length)
    }
  })

  it('outputs exactly width × height × scale at 2×', async () => {
    for (const format of ['png', 'jpg', 'webp'] as const) {
      const meta = await sharp(await renderDocument(doc([redBox], null, 101, 37), { format, scale: 2 })).metadata()
      expect(`${meta.width}x${meta.height}`, format).toBe('202x74')
    }
  })
})
