import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Document, Fit, ImageLayer, Layer } from '@bannerkit/core'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { OpError, addAssets, createProject } from '../src/ops/index.ts'
import { type RenderOptions, renderDocument } from '../src/render/renderDocument.ts'
import { tempRoot } from './harness.ts'
import { expectImageSnapshot } from './snapshot.ts'

const WHITE = [255, 255, 255, 255]
const GREEN = [0, 255, 0, 255]
const RED = [255, 0, 0, 255]
const BLUE = [0, 0, 255, 255]
const YELLOW = [255, 255, 0, 255]

/** A 200×100 PNG in four 50px vertical bands: green, red, blue, yellow. */
async function bandsPng(): Promise<Buffer> {
  const band = (left: number, background: string) => ({
    input: { create: { width: 50, height: 100, channels: 4 as const, background } },
    left,
    top: 0,
  })
  return sharp({ create: { width: 200, height: 100, channels: 4, background: '#000000' } })
    .composite([band(0, '#00ff00'), band(50, '#ff0000'), band(100, '#0000ff'), band(150, '#ffff00')])
    .png()
    .toBuffer()
}

/** The same four bands as an SVG with only a viewBox (40×10), which skia-canvas loads at a bogus size. */
const bandsSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10">' +
    '<rect x="0" width="10" height="10" fill="#00ff00"/><rect x="10" width="10" height="10" fill="#ff0000"/>' +
    '<rect x="20" width="10" height="10" fill="#0000ff"/><rect x="30" width="10" height="10" fill="#ffff00"/></svg>',
)

let projectDir: string
beforeEach(async () => {
  const root = await tempRoot()
  await createProject({ root, name: 'p' })
  await addAssets({
    root,
    project: 'p',
    files: [
      { filename: 'bands.png', data: await bandsPng() },
      { filename: 'bands.svg', data: bandsSvg },
    ],
  })
  projectDir = join(root, 'p')
})

function doc(layers: Layer[], width = 100, height = 100): Document {
  return { version: 1, name: 'test', canvas: { width, height, background: '#ffffff' }, layers }
}

const image = (fit: Fit, extra: Partial<ImageLayer> = {}): ImageLayer => ({
  id: 'image-1',
  type: 'image',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  src: 'assets/bands.png',
  fit,
  ...extra,
})

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return (x: number, y: number) => {
    const i = (y * info.width + x) * 4
    return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
  }
}

function near(actual: number[], expected: number[], tol = 3) {
  expect(actual.every((v, i) => Math.abs(v - expected[i]!) <= tol), `${actual} ≈ ${expected}`).toBe(true)
}

describe('renderDocument: image Layers', () => {
  it('contain: draws the whole image letterboxed in the centre of its Box', async () => {
    const png = await renderDocument(doc([image('contain')]), { projectDir })
    const at = await pixels(png)
    // 200×100 into 100×100: drawn 100×50 at y 25..75.
    near(at(50, 10), WHITE)
    near(at(50, 90), WHITE)
    near(at(5, 50), GREEN)
    near(at(37, 50), RED)
    near(at(62, 50), BLUE)
    near(at(95, 50), YELLOW)
    await expectImageSnapshot('image-fit-contain', png)
  })

  it('cover: fills the Box with the centre of the image, cropping the sides', async () => {
    const png = await renderDocument(doc([image('cover')]), { projectDir })
    const at = await pixels(png)
    // 200×100 scaled to 200×100 and cropped to its middle 100px: only red and blue remain.
    near(at(2, 2), RED)
    near(at(25, 50), RED)
    near(at(75, 50), BLUE)
    near(at(97, 97), BLUE)
    await expectImageSnapshot('image-fit-cover', png)
  })

  it('stretch: squeezes the whole image into the whole Box', async () => {
    const png = await renderDocument(doc([image('stretch')]), { projectDir })
    const at = await pixels(png)
    // Each 50px band becomes 25px wide, full height.
    near(at(5, 5), GREEN)
    near(at(37, 50), RED)
    near(at(62, 50), BLUE)
    near(at(95, 95), YELLOW)
    await expectImageSnapshot('image-fit-stretch', png)
  })

  it('draws an SVG Asset at its parsed size, not skia-canvas’s default, including a cover crop', async () => {
    // viewBox 40×10 into a 100×50 Box with cover: scaled ×5 to 200×50, cropped to the middle 100px.
    const png = await renderDocument(
      doc([
        image('cover', { src: 'assets/bands.svg', y: 25, height: 50 }),
        image('contain', { id: 'image-2', src: 'assets/bands.svg', y: 75, height: 25 }),
      ]),
      { projectDir },
    )
    const at = await pixels(png)
    near(at(50, 10), WHITE)
    near(at(2, 30), RED)
    near(at(48, 50), RED)
    near(at(52, 50), BLUE)
    near(at(97, 70), BLUE)
    // contain: 40×10 into 100×25 is exactly 100×25, every band visible.
    near(at(5, 87), GREEN)
    near(at(95, 87), YELLOW)
    await expectImageSnapshot('image-svg', png)
  })

  it('rotates around the Box centre, with opacity and shadow like other Layers', async () => {
    // A 100×20 stretched strip centred on (100, 50), rotated 90deg: stands at x 90..110, y 0..100.
    const png = await renderDocument(
      doc(
        [
          image('stretch', {
            x: 50,
            y: 40,
            width: 100,
            height: 20,
            rotation: 90,
            opacity: 0.5,
            shadow: { color: '#000000', blur: 0, offsetX: 20, offsetY: 0 },
          }),
        ],
        200,
        100,
      ),
      { projectDir },
    )
    const at = await pixels(png)
    near(at(60, 50), WHITE)
    // Green band is now at the top; half-opaque over white.
    near(at(100, 10), [128, 255, 128, 255], 4)
    near(at(100, 90), [255, 255, 128, 255], 4)
    // Shadow, 20px right of the strip, at half opacity.
    near(at(125, 50), [128, 128, 128, 255], 4)
    await expectImageSnapshot('image-rotation-effects', png)
  })
})

describe('renderDocument: image load failures', () => {
  async function failure(layers: Layer[], options: RenderOptions = { projectDir }): Promise<OpError> {
    const error = await renderDocument(doc(layers), options).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OpError)
    return error as OpError
  }

  it('names the Layer id and src of a missing Asset', async () => {
    const error = await failure([
      { id: 'rect-1', type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#000000' },
      image('cover', { id: 'image-3', src: 'assets/gone.png' }),
    ])
    expect(error.code).toBe('RENDER_FAILED')
    expect(error.message).toMatch(/"image-3"/)
    expect(error.message).toMatch(/"assets\/gone\.png"/)
    expect(error.issues).toEqual([{ path: 'layers[1].src', message: error.message }])
  })

  it('names the Layer of an Asset that cannot be decoded', async () => {
    await writeFile(join(projectDir, 'assets', 'broken.png'), 'not an image')
    const error = await failure([image('contain', { src: 'assets/broken.png' })])
    expect(error.code).toBe('RENDER_FAILED')
    expect(error.message).toMatch(/"image-1".*"assets\/broken\.png"/)
  })

  it('refuses a src outside the Project, and image Layers without a projectDir', async () => {
    expect((await failure([image('contain', { src: '../p/assets/bands.png' })])).message).toMatch(/inside the Project/)
    expect((await failure([image('contain')], {})).message).toMatch(/"image-1"/)
  })
})
