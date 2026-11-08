import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { OpError, addAssets, createProject } from '../src/ops/index.ts'
import { tempRoot } from './harness.ts'

let root: string
beforeEach(async () => {
  root = await tempRoot()
  await createProject({ root, name: 'p' })
})

const assetFile = (src: string) => join(root, 'p', src)

/** A solid-colour PNG, generated so the fixture is deterministic. */
const png = (width = 8, height = 6, background = { r: 10, g: 120, b: 200 }) =>
  sharp({ create: { width, height, channels: 3, background } }).png().toBuffer()

describe('addAssets', () => {
  it('stores a PNG under assets/ and returns its project-relative src and size', async () => {
    const result = await addAssets({ root, project: 'p', files: [{ filename: 'shoe.png', data: await png(8, 6) }] })

    expect(result.assets).toEqual([
      { src: 'assets/shoe.png', path: assetFile('assets/shoe.png'), format: 'png', width: 8, height: 6 },
    ])
    const meta = await sharp(await readFile(assetFile('assets/shoe.png'))).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 8, 6])
  })

  it('auto-orients an EXIF-rotated JPEG and strips its metadata', async () => {
    const result = await addAssets({ root, project: 'p', files: [{ filename: 'phone.jpg', data: await exifRotatedJpeg() }] })

    // Stored 40x20 with orientation 6 (rotate 90 deg clockwise): displays 20x40, red on top.
    expect(result.assets[0]).toMatchObject({ src: 'assets/phone.jpg', format: 'jpeg', width: 20, height: 40 })
    const stored = await readFile(assetFile('assets/phone.jpg'))
    const meta = await sharp(stored).metadata()
    expect([meta.format, meta.width, meta.height, meta.orientation, meta.exif]).toEqual(['jpeg', 20, 40, undefined, undefined])
    expect(maxDiff(await pixel(stored, 10, 2), [255, 0, 0])).toBeLessThanOrEqual(4)
    expect(maxDiff(await pixel(stored, 10, 37), [0, 0, 255])).toBeLessThanOrEqual(4)
  })

  it('converts a Display P3 PNG to sRGB and drops the profile', async () => {
    // Authored as sRGB (200,100,50), stored as P3 bytes (187,105,62) with a P3 profile.
    const p3 = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 100, b: 50 } } })
      .withIccProfile('p3')
      .png()
      .toBuffer()
    expect(await pixel(p3, 1, 1)).toEqual([187, 105, 62])

    await addAssets({ root, project: 'p', files: [{ filename: 'wide.png', data: p3 }] })

    const stored = await readFile(assetFile('assets/wide.png'))
    expect((await sharp(stored).metadata()).icc).toBeUndefined()
    expect(maxDiff(await pixel(stored, 1, 1), [200, 100, 50])).toBeLessThanOrEqual(1)
  })

  it('re-encodes WebP losslessly', async () => {
    const raw = Buffer.from(Array.from({ length: 4 * 4 * 3 }, (_, i) => (i * 37) % 256))
    const webp = await sharp(raw, { raw: { width: 4, height: 4, channels: 3 } }).webp({ lossless: true }).toBuffer()

    const result = await addAssets({ root, project: 'p', files: [{ filename: 'tile.webp', data: webp }] })

    expect(result.assets[0]).toMatchObject({ src: 'assets/tile.webp', format: 'webp', width: 4, height: 4 })
    const stored = await readFile(assetFile('assets/tile.webp'))
    expect((await sharp(stored).metadata()).format).toBe('webp')
    expect(await sharp(stored).removeAlpha().raw().toBuffer()).toEqual(raw)
  })

  it('rejects anything but PNG, JPEG, WebP and SVG, and writes nothing from the batch', async () => {
    const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } }).gif().toBuffer()
    const files = [
      { filename: 'ok.png', data: await png() },
      { filename: 'anim.gif', data: gif },
    ]

    const error = await addAssets({ root, project: 'p', files }).catch((e) => e)

    expect(error).toBeInstanceOf(OpError)
    expect(error.code).toBe('UNSUPPORTED_ASSET')
    expect(error.message).toBe('anim.gif: unsupported image format "gif" (expected PNG, JPEG, WebP or SVG)')
    expect(await readdir(join(root, 'p', 'assets'))).toEqual([])
  })

  it('rejects a file that is not an image at all', async () => {
    const error = await addAssets({
      root,
      project: 'p',
      files: [{ filename: 'notes.png', data: Buffer.from('hello') }],
    }).catch((e) => e)

    expect(error).toMatchObject({
      code: 'UNSUPPORTED_ASSET',
      message: 'notes.png: not a readable image (expected PNG, JPEG, WebP or SVG)',
    })
  })

  it('sanitises filenames and gives the extension of the stored format', async () => {
    const files = [
      { filename: '../../Évent Photo (1).PNG', data: await png() },
      { filename: 'C:\\Users\\me\\logo.jpeg', data: await sharp(await png()).jpeg().toBuffer() },
      { filename: '...', data: await png() },
      { filename: 'really-a-png.jpg', data: await png() },
    ]

    const { assets } = await addAssets({ root, project: 'p', files })

    expect(assets.map((a) => a.src)).toEqual([
      'assets/event-photo-1.png',
      'assets/logo.jpg',
      'assets/asset.png',
      'assets/really-a-png.png',
    ])
  })

  it('de-duplicates names with a numeric suffix and never overwrites an existing Asset', async () => {
    const first = await png(2, 2)
    await addAssets({ root, project: 'p', files: [{ filename: 'shoe.png', data: first }] })

    const { assets } = await addAssets({
      root,
      project: 'p',
      files: [
        { filename: 'shoe.png', data: await png(3, 3) },
        { filename: 'Shoe.png', data: await png(4, 4) },
      ],
    })

    expect(assets.map((a) => [a.src, a.width])).toEqual([
      ['assets/shoe-1.png', 3],
      ['assets/shoe-2.png', 4],
    ])
    expect((await sharp(await readFile(assetFile('assets/shoe.png'))).metadata()).width).toBe(2)
    expect((await readdir(join(root, 'p', 'assets'))).sort()).toEqual(['shoe-1.png', 'shoe-2.png', 'shoe.png'])
  })

  it('stores an SVG byte-for-byte and reports its intrinsic size', async () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40"/></svg>\n',
    )

    const { assets } = await addAssets({ root, project: 'p', files: [{ filename: 'Logo.svg', data: svg }] })

    expect(assets).toEqual([{ src: 'assets/logo.svg', path: assetFile('assets/logo.svg'), format: 'svg', width: 120, height: 40 }])
    expect(await readFile(assetFile('assets/logo.svg'))).toEqual(svg)
  })

  it('rejects an SVG with no usable size', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100%"><rect/></svg>')

    const error = await addAssets({ root, project: 'p', files: [{ filename: 'icon.svg', data: svg }] }).catch((e) => e)

    expect(error).toMatchObject({
      code: 'UNSUPPORTED_ASSET',
      message: 'icon.svg: SVG has no intrinsic size; give the <svg> element width and height or a viewBox',
    })
  })
})

/** Stored 40x20, left half red and right half blue, tagged EXIF orientation 6. */
async function exifRotatedJpeg(): Promise<Buffer> {
  const raw = Buffer.alloc(40 * 20 * 3)
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 40; x++) raw.set(x < 20 ? [255, 0, 0] : [0, 0, 255], (y * 40 + x) * 3)
  return sharp(raw, { raw: { width: 40, height: 20, channels: 3 } })
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Copyright: 'someone' } })
    .toBuffer()
}

/** RGB at (x, y), read without colour conversion. */
async function pixel(file: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(file).keepIccProfile().removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (y * info.width + x) * info.channels
  return [...data.subarray(at, at + 3)]
}

const maxDiff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)))
