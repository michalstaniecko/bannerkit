// S3: browser Export from the editor module, in real Chromium on a 2× device-pixel-ratio
// screen. Export size is the Canvas size × scale, whatever the zoom or the screen.
import { PRESETS, type Document } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

test.use({ deviceScaleFactor: 2 })

const presetDocument = (width: number, height: number, background: string | null): Document => ({
  version: 1,
  name: `preset-${width}x${height}`,
  canvas: { width, height, background },
  layers: [{ id: 'rect-1', type: 'rect', x: 0, y: 0, width: width / 2, height: height / 2, fill: '#ff0000' }],
})

test('Export is exactly the Canvas size × scale for every Preset on a 2× screen, at any zoom', async ({ harness }) => {
  const sizes = Object.values(PRESETS).map(({ width, height }) => ({ width, height }))
  const results = await harness.evaluate(async (sizes) => {
    const { createEditor, host } = window.bannerkit
    const out: { size: string; scale: number; format: string; width: number; height: number; type: string }[] = []
    for (const { width, height } of sizes) {
      const editor = createEditor()
      editor.mount(host())
      await editor.load({ version: 1, name: 'p', canvas: { width, height, background: '#ffffff' }, layers: [] })
      editor.setZoom(0.37)
      for (const scale of [1, 2] as const) {
        for (const format of ['png', 'jpg', 'webp'] as const) {
          const { blob } = await editor.export({ format, scale })
          const bitmap = await createImageBitmap(blob)
          out.push({ size: `${width}x${height}`, scale, format, width: bitmap.width, height: bitmap.height, type: blob.type })
        }
      }
      await editor.destroy()
      host().replaceChildren()
    }
    return { dpr: devicePixelRatio, out }
  }, sizes)

  expect(results.dpr).toBe(2)
  const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>
  for (const r of results.out) {
    const [w, h] = r.size.split('x').map(Number)
    expect([r.width, r.height, r.type], `${r.size} ${r.format} @${r.scale}x`).toEqual([w! * r.scale, h! * r.scale, mime[r.format]])
  }
})

test('the top bar Export control saves the chosen format and scale, named like the server', async ({ page }) => {
  await page.goto('/?project=demo&doc=square')
  await expect(page.locator('canvas.lower-canvas')).toBeVisible()

  await page.getByLabel('Format').selectOption('jpg')
  await page.getByLabel('Scale').selectOption('2')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()])

  expect(download.suggestedFilename()).toBe('square.1080x1080@2x.jpg')
  const sharp = (await import('sharp')).default
  const meta = await sharp(await download.path()).metadata()
  expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 2160, 2160])
})

test('JPEG Export is flattened onto the background (white if transparent); PNG keeps alpha', async ({ harness }) => {
  const pixels = await harness.evaluate(async (documents) => {
    const { createEditor, host } = window.bannerkit
    /** RGBA of the top-left and bottom-right quarter centres. */
    const sample = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob)
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const at = (fx: number, fy: number) => [...ctx.getImageData(bitmap.width * fx, bitmap.height * fy, 1, 1).data]
      return { painted: at(0.25, 0.25), empty: at(0.75, 0.75) }
    }
    const out: Record<string, { painted: number[]; empty: number[] }> = {}
    for (const [key, document] of Object.entries(documents)) {
      const editor = createEditor()
      editor.mount(host())
      await editor.load(document)
      out[`${key}.png`] = await sample((await editor.export({ format: 'png' })).blob)
      out[`${key}.jpg`] = await sample((await editor.export({ format: 'jpg', quality: 100 })).blob)
      await editor.destroy()
      host().replaceChildren()
    }
    return out
  }, { transparent: presetDocument(300, 250, null), blue: presetDocument(300, 250, '#0000ff') })

  const near = (actual: number[], expected: number[]) =>
    expect(actual.every((v, i) => Math.abs(v - expected[i]!) <= 3), `${actual} ≈ ${expected}`).toBe(true)
  near(pixels['transparent.png']!.painted, [255, 0, 0, 255])
  expect(pixels['transparent.png']!.empty[3]).toBe(0)
  near(pixels['transparent.jpg']!.painted, [255, 0, 0, 255])
  near(pixels['transparent.jpg']!.empty, [255, 255, 255, 255])
  near(pixels['blue.jpg']!.empty, [0, 0, 255, 255])
})
