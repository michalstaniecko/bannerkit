import type { Document, Layer } from '@bannerkit/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { renderDocument } from '../src/render/renderDocument.ts'
import { expectImageSnapshot } from './snapshot.ts'

function doc(layers: Layer[], background: string | null = '#ffffff', width = 200, height = 100): Document {
  return { version: 1, name: 'test', canvas: { width, height, background }, layers }
}

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return (x: number, y: number) => {
    const i = (y * info.width + x) * 4
    return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
  }
}

/** Asserts every channel is within `tol` of the expected RGBA. */
function near(actual: number[], expected: number[], tol = 3) {
  expect(actual.every((v, i) => Math.abs(v - expected[i]!) <= tol), `${actual} ≈ ${expected}`).toBe(true)
}

describe('renderDocument: rect Layers', () => {
  it('fills a linear gradient along the CSS angle (90 = to right)', async () => {
    const png = await renderDocument(
      doc([
        {
          id: 'rect-1',
          type: 'rect',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          fill: { type: 'linear', angle: 90, stops: [['#ff0000', 0], ['#0000ff', 1]] },
        },
      ]),
    )
    const at = await pixels(png)
    near(at(1, 50), [254, 0, 1, 255], 4)
    near(at(198, 50), [1, 0, 254, 255], 4)
    // Constant along the vertical: 90deg has no y component.
    expect(at(100, 5)).toEqual(at(100, 95))
    await expectImageSnapshot('rect-gradient-90', png)
  })

  it('rounds corners by cornerRadius', async () => {
    const png = await renderDocument(
      doc([{ id: 'rect-1', type: 'rect', x: 20, y: 10, width: 160, height: 80, fill: '#ff0000', cornerRadius: 30 }]),
    )
    const at = await pixels(png)
    // The corner pixel sits outside a 30px radius arc; the straight edge is still filled.
    near(at(22, 12), [255, 255, 255, 255])
    near(at(177, 87), [255, 255, 255, 255])
    near(at(100, 11), [255, 0, 0, 255])
    near(at(21, 50), [255, 0, 0, 255])
    near(at(30, 20), [255, 0, 0, 255])
    await expectImageSnapshot('rect-corner-radius', png)
  })

  it('rotates in degrees around the Box centre, with x/y the unrotated top-left', async () => {
    // A 120×20 bar centred on (100, 50). At 90deg it stands upright: x 90-110, y -10..110.
    const png = await renderDocument(
      doc([{ id: 'rect-1', type: 'rect', x: 40, y: 40, width: 120, height: 20, fill: '#00ff00', rotation: 90 }]),
    )
    const at = await pixels(png)
    near(at(100, 5), [0, 255, 0, 255])
    near(at(100, 95), [0, 255, 0, 255])
    near(at(92, 50), [0, 255, 0, 255])
    near(at(50, 50), [255, 255, 255, 255])
    near(at(150, 50), [255, 255, 255, 255])
    near(at(115, 50), [255, 255, 255, 255])
    await expectImageSnapshot('rect-rotation-90', png)
  })

  it('rotates a gradient with its Box', async () => {
    // Gradient 90 = to right in Box space; rotated 90deg clockwise it runs top to bottom.
    const png = await renderDocument(
      doc(
        [
          {
            id: 'rect-1',
            type: 'rect',
            x: 0,
            y: 50,
            width: 100,
            height: 100,
            rotation: 90,
            fill: { type: 'linear', angle: 90, stops: [['#ff0000', 0], ['#0000ff', 1]] },
            cornerRadius: 10,
          },
        ],
        null,
        100,
        200,
      ),
    )
    const at = await pixels(png)
    near(at(50, 52), [253, 0, 2, 255], 6)
    near(at(50, 147), [2, 0, 253, 255], 6)
    expect(at(50, 25)[3]).toBe(0)
    await expectImageSnapshot('rect-rotation-gradient', png)
  })

  it('applies opacity (0-1) to a Layer', async () => {
    const png = await renderDocument(
      doc([{ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 200, height: 100, fill: '#000000', opacity: 0.25 }]),
    )
    const at = await pixels(png)
    near(at(100, 50), [191, 191, 191, 255], 2)
    await expectImageSnapshot('rect-opacity', png)
  })

  it('does not draw hidden Layers', async () => {
    const png = await renderDocument(
      doc([{ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 200, height: 100, fill: '#000000', visible: false }]),
    )
    const at = await pixels(png)
    expect(at(100, 50)).toEqual([255, 255, 255, 255])
  })

  it('casts a shadow with colour, blur and offset in Canvas pixels', async () => {
    const png = await renderDocument(
      doc([
        {
          id: 'rect-1',
          type: 'rect',
          x: 40,
          y: 20,
          width: 60,
          height: 40,
          fill: '#ff0000',
          shadow: { color: '#000000', blur: 0, offsetX: 30, offsetY: 20 },
        },
      ]),
    )
    const at = await pixels(png)
    // Offset shadow pokes out right and below by exactly the offset, at Canvas scale (not 2× supersample).
    near(at(70, 40), [255, 0, 0, 255])
    // Shadow covers x 70-130, y 40-80.
    near(at(128, 78), [0, 0, 0, 255])
    near(at(132, 70), [255, 255, 255, 255])
    near(at(115, 82), [255, 255, 255, 255])
    near(at(68, 70), [255, 255, 255, 255])
  })

  it('blurs a shadow and combines it with opacity and rotation', async () => {
    const png = await renderDocument(
      doc([
        {
          id: 'rect-1',
          type: 'rect',
          x: 60,
          y: 30,
          width: 80,
          height: 40,
          fill: '#3366ff',
          rotation: 20,
          opacity: 0.8,
          cornerRadius: 8,
          shadow: { color: 'rgba(0,0,0,0.6)', blur: 12, offsetX: 6, offsetY: 8 },
        },
      ]),
    )
    await expectImageSnapshot('rect-shadow-blur', png)
  })

  it('renders a null Canvas background as transparent PNG alpha', async () => {
    const png = await renderDocument(
      doc(
        [{ id: 'rect-1', type: 'rect', x: 50, y: 25, width: 100, height: 50, fill: 'rgba(255,0,0,0.5)', cornerRadius: 12 }],
        null,
      ),
    )
    expect((await sharp(png).metadata()).hasAlpha).toBe(true)
    const at = await pixels(png)
    expect(at(10, 10)[3]).toBe(0)
    near(at(100, 50), [255, 0, 0, 128], 2)
    await expectImageSnapshot('rect-transparent-canvas', png)
  })
})
