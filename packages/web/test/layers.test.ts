// S2: image and text Layers in the editor module (jsdom + node-canvas).
// Image geometry is checked through rendered pixels. Text is checked only for what
// does not depend on metrics (spec, S2): the line-break parity and the font
// fallback guard need Chrome and live in the S3 suite (packages/web/e2e).
import type { Document, ImageLayer, Layer, TextLayer } from '@bannerkit/core'
import { FabricImage, Textbox } from 'fabric'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditor, type Editor, type EditorOptions } from '../src/editor/index.ts'

const doc = (layers: Layer[]): Document => ({
  version: 2,
  name: 'hero',
  canvas: { width: 200, height: 100, background: '#ffffff' },
  layers,
})

let editor: Editor | undefined
afterEach(async () => {
  await editor?.destroy()
  editor = undefined
  document.body.innerHTML = ''
})

/** A 40×20 PNG: left half red, right half blue. */
function twoToneImage(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 40
  canvas.height = 20
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 20, 20)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(20, 0, 20, 20)
  return canvas.toDataURL('image/png')
}

const ASSETS: Record<string, string> = {}
const assetUrl = (src: string) => ASSETS[src] ?? `data:image/png;base64,bm90IGFuIGltYWdl`

async function open(
  document_: Document,
  options: EditorOptions = { loadFonts: async () => {} },
): Promise<{ editor: Editor; container: HTMLElement }> {
  ASSETS['assets/two-tone.png'] ??= twoToneImage()
  const container = document.createElement('div')
  document.body.append(container)
  editor = createEditor(options)
  editor.mount(container)
  await editor.load(document_, { assetUrl })
  return { editor, container }
}

function pixel(container: HTMLElement, x: number, y: number): [number, number, number, number] {
  const element = container.querySelector<HTMLCanvasElement>('canvas.lower-canvas')!
  const [r, g, b, a] = element.getContext('2d')!.getImageData(x, y, 1, 1).data
  return [r!, g!, b!, a!]
}

const RED = [255, 0, 0, 255]
const BLUE = [0, 0, 255, 255]
const WHITE = [255, 255, 255, 255]

const image = (over: Partial<ImageLayer> = {}): ImageLayer => ({
  id: 'image-1',
  type: 'image',
  x: 50,
  y: 25,
  width: 40,
  height: 40,
  src: 'assets/two-tone.png',
  fit: 'cover',
  ...over,
})

describe('image Layers', () => {
  it('cover fills the Box and crops what falls outside it', async () => {
    const { container } = await open(doc([image({ fit: 'cover' })]))

    // scaled ×2 and cropped to the middle 20 px of the image: red | blue, 20 px each
    expect(pixel(container, 52, 45)).toEqual(RED)
    expect(pixel(container, 68, 45)).toEqual(RED)
    expect(pixel(container, 72, 45)).toEqual(BLUE)
    expect(pixel(container, 88, 45)).toEqual(BLUE)
    expect(pixel(container, 46, 45)).toEqual(WHITE)
    expect(pixel(container, 94, 45)).toEqual(WHITE)
  })

  it('contain letterboxes the whole image inside the Box', async () => {
    const { container } = await open(doc([image({ fit: 'contain' })]))

    // unscaled 40×20, centred vertically: y 35..55
    expect(pixel(container, 52, 37)).toEqual(RED)
    expect(pixel(container, 88, 53)).toEqual(BLUE)
    expect(pixel(container, 60, 31)).toEqual(WHITE)
    expect(pixel(container, 60, 59)).toEqual(WHITE)
  })

  it('stretch maps the whole image onto the whole Box', async () => {
    const { container } = await open(doc([image({ fit: 'stretch' })]))

    expect(pixel(container, 52, 27)).toEqual(RED)
    expect(pixel(container, 68, 63)).toEqual(RED)
    expect(pixel(container, 72, 27)).toEqual(BLUE)
    expect(pixel(container, 88, 63)).toEqual(BLUE)
  })

  it('rotates the fitted image around the Box centre', async () => {
    const { container } = await open(doc([image({ fit: 'stretch', rotation: 90 })]))

    // centre (70, 45); rotated 90° the red half (left) lands on top
    expect(pixel(container, 70, 30)).toEqual(RED)
    expect(pixel(container, 70, 60)).toEqual(BLUE)
  })

  it('round-trips every Fit, with rotation, unchanged', async () => {
    const original = doc([
      image({ fit: 'cover', rotation: 30, opacity: 0.5 }),
      image({ id: 'image-2', fit: 'contain', x: 3.5, y: -2, width: 17, height: 90, rotation: -12.5 }),
      image({ id: 'image-3', fit: 'stretch', width: 13, height: 7, locked: true }),
    ])

    const { editor } = await open(original)

    expect(editor.objectFor('image-1')).toBeInstanceOf(FabricImage)
    expect(editor.getDocument()).toEqual(original)
  })

  it('shows a missing Asset as a hatched placeholder and keeps the Document editable', async () => {
    const original = doc([image({ src: 'assets/missing.png', rotation: 15 })])

    const { editor, container } = await open(original)

    expect(editor.objectFor('image-1')).not.toBeInstanceOf(FabricImage)
    const row = Array.from({ length: 30 }, (_, i) => pixel(container, 55 + i, 45).join())
    expect(new Set(row).size).toBeGreaterThan(1) // stripes, not a flat fill
    expect(pixel(container, 30, 45)).toEqual(WHITE)
    expect(editor.getDocument()).toEqual(original)

    editor.objectFor('image-1')!.set({ left: 100 })
    expect(editor.getDocument().layers[0]).toMatchObject({ x: 80, src: 'assets/missing.png' })
  })
})

const text = (over: Partial<TextLayer> = {}): TextLayer => ({
  id: 'text-1',
  type: 'text',
  x: 10,
  y: 10,
  width: 180,
  text: 'Summer sale on every shoe',
  fontFamily: 'Inter',
  fontWeight: 700,
  fontSize: 24,
  fill: '#111111',
  ...over,
})

describe('text Layers', () => {
  it('map to a Textbox in the Layer font, at the declared size without AutoFit', async () => {
    const { editor } = await open(doc([text({ align: 'center', lineHeight: 1.3 })]))

    const box = editor.objectFor('text-1')
    expect(box).toBeInstanceOf(Textbox)
    expect(box).toMatchObject({
      text: 'Summer sale on every shoe',
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: 24,
      lineHeight: 1.3,
      textAlign: 'center',
      fill: '#111111',
    })
  })

  it('use the font size AutoFit resolves, not the declared one', async () => {
    const { editor } = await open(
      doc([text({ text: 'A headline far too long for its Box', height: 20, fontSize: 80, autoFit: { minFontSize: 8 } })]),
    )

    const size = (editor.objectFor('text-1') as Textbox).fontSize
    expect(size).toBeLessThan(80)
    expect(size).toBeGreaterThanOrEqual(8)
  })

  it('convert letterSpacing px to Fabric charSpacing at the resolved size', async () => {
    const { editor } = await open(doc([text({ fontSize: 20, letterSpacing: 2 })]))

    expect((editor.objectFor('text-1') as Textbox).charSpacing).toBe(100) // 2px / 20px × 1000
  })

  it('load every family/weight the Document uses before creating text', async () => {
    const calls: string[] = []
    let textBeforeFonts = false
    const { editor: opened } = await open(doc([text(), text({ id: 'text-2', fontWeight: 400 }), text({ id: 'text-3' })]), {
      loadFonts: async (faces) => {
        textBeforeFonts ||= editor?.objectFor('text-1') !== undefined
        calls.push(...faces.map((f) => `${f.family}/${f.weight}`))
      },
    })

    expect(opened.objectFor('text-1')).toBeDefined()
    expect(textBeforeFonts).toBe(false)
    expect(calls.sort()).toEqual(['Inter/400', 'Inter/700'])
  })

  it('load the italic face of an italic Layer and draw the Textbox in italic', async () => {
    const calls: string[] = []
    const { editor } = await open(doc([text(), text({ id: 'text-2', fontStyle: 'italic' })]), {
      loadFonts: async (faces) => void calls.push(...faces.map((f) => `${f.family}/${f.weight}/${f.style}`)),
    })

    expect(calls.sort()).toEqual(['Inter/700/italic', 'Inter/700/normal'])
    expect((editor.objectFor('text-1') as Textbox).fontStyle).toBe('normal')
    expect((editor.objectFor('text-2') as Textbox).fontStyle).toBe('italic')
  })

  it('load the italic face before switching a shown Layer to italic', async () => {
    const calls: string[] = []
    const { editor } = await open(doc([text()]), {
      loadFonts: async (faces) => void calls.push(...faces.map((f) => `${f.family}/${f.weight}/${f.style}`)),
    })
    calls.length = 0

    await editor.update(() => doc([text({ fontStyle: 'italic' })]), { cause: 'inspector' })

    expect(calls).toContain('Inter/700/italic')
    expect((editor.objectFor('text-1') as Textbox).fontStyle).toBe('italic')
    expect(editor.getDocument().layers[0]).toMatchObject({ fontStyle: 'italic' })
  })

  it('round-trip unchanged, with a Box height, alignment and rotation', async () => {
    const original = doc([
      text({ height: 60, verticalAlign: 'middle', align: 'right', rotation: 20, letterSpacing: 1.5, opacity: 0.9 }),
      text({ id: 'text-2', text: 'Line one\nline two', verticalAlign: 'bottom', height: 80, autoFit: { minFontSize: 10 } }),
      text({ id: 'text-3', text: 'Supercalifragilistic', width: 30 }),
    ])

    const { editor } = await open(original)

    expect(editor.getDocument()).toEqual(original)
  })

  it('a moved Textbox moves its Box by the same amount', async () => {
    const { editor } = await open(doc([text({ height: 60, verticalAlign: 'bottom' })]))
    const box = editor.objectFor('text-1')!

    box.set({ left: box.left + 15, top: box.top - 5 })

    expect(editor.getDocument().layers[0]).toMatchObject({ x: 25, y: 5, width: 180, height: 60 })
  })
})
