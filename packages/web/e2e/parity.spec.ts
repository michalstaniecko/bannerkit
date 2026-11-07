// S3: browser Export and server Render of the same Document differ by less than 1% of
// pixels at 1×, for examples/demo and a Document at every Preset size. The server
// side goes through REST (the same `render` op as the CLI); the browser side is the
// editor module's `export` in Chromium. Both are compared as decoded RGBA with pixelmatch.
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PRESETS, type Document } from '@bannerkit/core'
import pixelmatch from 'pixelmatch'
import sharp from 'sharp'
import { expect, test } from './fixtures.ts'
import { repoRoot } from './root.ts'

/** Parity budget: the share of pixels allowed to differ (pixelmatch's default colour threshold). */
const MAX_DIFF = 0.01

/** A banner using every Layer type and effect, laid out relative to `width × height`. */
function presetDocument(width: number, height: number): Document {
  const u = Math.min(width, height)
  const tall = height > width
  return {
    version: 2,
    name: `preset-${width}x${height}`,
    canvas: { width, height, background: '#ffffff' },
    layers: [
      { id: 'rect-1', type: 'rect', x: 0, y: 0, width, height, fill: { type: 'linear', angle: 135, stops: [['#13315c', 0], ['#3e7cb1', 1]] } },
      { id: 'rect-2', type: 'rect', x: width * 0.55, y: height * 0.1, width: u * 0.8, height: u * 0.8, fill: '#ffffff', cornerRadius: u * 0.4, opacity: 0.15 },
      {
        id: 'image-1',
        type: 'image',
        x: width * 0.68,
        y: height * 0.08,
        width: width * 0.24,
        height: height * 0.84,
        src: 'assets/bottle.png',
        fit: 'contain',
        rotation: -6,
        shadow: { color: 'rgba(0,0,0,0.4)', blur: u * 0.04, offsetX: u * 0.02, offsetY: u * 0.03 },
      },
      { id: 'image-2', type: 'image', x: width * 0.05, y: height * 0.06, width: width * 0.2, height: height * 0.1, src: 'assets/alder-logo.svg', fit: 'contain' },
      {
        id: 'text-1',
        type: 'text',
        x: width * 0.05,
        y: height * (tall ? 0.25 : 0.2),
        width: width * 0.6,
        height: height * 0.45,
        text: 'Cold for 24 hours. Hot for 12.',
        fontFamily: 'Inter',
        fontWeight: 800,
        fontSize: Math.round(u * 0.2),
        lineHeight: 1.05,
        letterSpacing: -1,
        fill: '#ffffff',
        verticalAlign: 'middle',
        autoFit: { minFontSize: 8 },
      },
      {
        id: 'rect-3',
        type: 'rect',
        x: width * 0.05,
        y: height * 0.75,
        width: width * 0.25,
        height: height * 0.16,
        fill: '#f6c453',
        cornerRadius: height * 0.08,
        shadow: { color: 'rgba(0,0,0,0.25)', blur: 8, offsetX: 0, offsetY: 4 },
      },
      {
        id: 'text-2',
        type: 'text',
        x: width * 0.05,
        y: height * 0.75,
        width: width * 0.25,
        height: height * 0.16,
        text: 'Shop now',
        fontFamily: 'Inter',
        fontWeight: 600,
        fontSize: Math.round(u * 0.08),
        fill: '#13315c',
        align: 'center',
        verticalAlign: 'middle',
        autoFit: { minFontSize: 6 },
      },
    ],
  }
}

const demoAssets = join(repoRoot, 'examples/demo/assets')

/** The demo Documents as committed, then one Document per Preset, each in its own Project. */
const cases: { project: string; doc: string; document?: Document }[] = [
  ...['hero', 'rectangle', 'square'].map((doc) => ({ project: 'demo', doc })),
  ...Object.values(PRESETS).map(({ width, height }) => ({
    project: `s3-parity-${width}x${height}`,
    doc: 'banner',
    document: presetDocument(width, height),
  })),
]

const rgba = async (png: Buffer) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

for (const { project, doc, document } of cases) {
  test(`browser Export and server Render of ${project}/${doc} differ by < 1% of pixels at 1×`, async ({ harness, request, projects }) => {
    if (document) {
      const assets = Object.fromEntries(
        await Promise.all(['bottle.png', 'alder-logo.svg'].map(async (file) => [file, await readFile(join(demoAssets, file))] as const)),
      )
      await projects.write(project, { documents: { [doc]: document }, assets })
    }
    const server = await request.post(`/api/projects/${project}/documents/${doc}/render`, { data: { format: 'png', scale: 1 } })
    expect(server.status()).toBe(200)

    const browserPng = await harness.evaluate(
      async ({ project, doc }) => {
        const { createEditor, host } = window.bannerkit
        const { document } = (await (await fetch(`/api/projects/${project}/documents/${doc}`)).json()) as { document: Document }
        const editor = createEditor()
        editor.mount(host())
        await editor.load(document, { assetUrl: (src) => `/api/projects/${project}/${src}` })
        const { blob } = await editor.export({ format: 'png', scale: 1 })
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        for (const b of bytes) binary += String.fromCharCode(b)
        return btoa(binary)
      },
      { project, doc },
    )

    const a = await rgba(Buffer.from(await server.body()))
    const b = await rgba(Buffer.from(browserPng, 'base64'))
    expect([b.width, b.height]).toEqual([a.width, a.height])
    const diff = Buffer.alloc(a.data.length)
    // BANNERKIT_PARITY_DUMP=<dir> writes both images and the pixelmatch diff, for diagnosis.
    const differing = pixelmatch(a.data, b.data, diff, a.width, a.height)
    const dump = process.env.BANNERKIT_PARITY_DUMP
    if (dump) {
      await mkdir(dump, { recursive: true })
      const raw = { raw: { width: a.width, height: a.height, channels: 4 as const } }
      await sharp(a.data, raw).png().toFile(join(dump, `${project}-${doc}.server.png`))
      await sharp(b.data, raw).png().toFile(join(dump, `${project}-${doc}.browser.png`))
      await sharp(diff, raw).png().toFile(join(dump, `${project}-${doc}.diff.png`))
    }
    const ratio = differing / (a.width * a.height)
    test.info().annotations.push({ type: 'parity', description: `${project}/${doc}: ${(ratio * 100).toFixed(3)}% of pixels differ` })
    console.log(`parity ${project}/${doc}: ${(ratio * 100).toFixed(3)}%`)
    expect(ratio).toBeLessThan(MAX_DIFF)
  })
}
