// S3: text in real Chromium. Fabric `Textbox` must break lines exactly where core's
// Text Layout does (ADR 0004), and text must never be laid out in a fallback font
// (ADR 0003).
import type { TextLayer } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

const base = { type: 'text', x: 0, y: 0, fontFamily: 'Inter', fill: '#000000' } as const

/** Each case is one text Layer; together they cover the wrapping rules core copies from Fabric. */
const CORPUS: Omit<TextLayer, 'id' | 'type' | 'x' | 'y' | 'fontFamily' | 'fill'>[] = [
  { text: 'Summer sale on every running shoe in the store', width: 300, fontSize: 32, fontWeight: 700 },
  { text: 'Summer sale on every running shoe in the store', width: 301, fontSize: 32, fontWeight: 400 },
  { text: 'The quick brown fox jumps over the lazy dog', width: 180, fontSize: 24, fontWeight: 300 },
  { text: 'AVATAR To. Ty WAVE Yo, Ta. LT AV', width: 220, fontSize: 40, fontWeight: 700 },
  { text: 'Kerning: AV AW AY Te To Tr Ty Va Wa Ya', width: 260, fontSize: 30, fontWeight: 900 },
  { text: 'line1\nline2\n\nline4 wraps when it is long enough', width: 200, fontSize: 28, fontWeight: 500 },
  { text: 'Hello   world  with   runs of spaces', width: 160, fontSize: 30, fontWeight: 400 },
  { text: ' leading space here and there', width: 140, fontSize: 30, fontWeight: 400 },
  { text: 'trailing spaces stay put   ', width: 150, fontSize: 30, fontWeight: 600 },
  { text: 'tabs\tand\rcarriage returns become spaces', width: 200, fontSize: 24, fontWeight: 400 },
  { text: 'Supercalifragilistic\nshort words here', width: 200, fontSize: 40, fontWeight: 700 },
  { text: 'Tight letter spacing changes where lines break', width: 240, fontSize: 28, fontWeight: 700, letterSpacing: -1.5 },
  { text: 'Wide letter spacing changes where lines break', width: 240, fontSize: 28, fontWeight: 400, letterSpacing: 4 },
  { text: 'Centred text, right text, same breaks', width: 200, fontSize: 26, fontWeight: 800, align: 'center' },
  { text: 'Right aligned with a taller line height', width: 210, fontSize: 26, fontWeight: 200, align: 'right', lineHeight: 1.6 },
  { text: 'Ünïcødé façade — naïve café, “quotes” and 50% off €99.99!', width: 230, fontSize: 28, fontWeight: 500 },
  { text: 'AutoFit shrinks this long headline until it fits the Box', width: 260, height: 90, fontSize: 72, fontWeight: 900, autoFit: { minFontSize: 12 } },
  { text: 'Unbreakablesuperlongwordthatneedsshrinking ok', width: 200, height: 200, fontSize: 60, fontWeight: 700, autoFit: { minFontSize: 8 } },
  { text: 'Still overflowing at the minimum size because the box is tiny', width: 120, height: 30, fontSize: 40, fontWeight: 700, autoFit: { minFontSize: 20 } },
  { text: '1200 × 628 · 1080 × 1080 · 300 × 250 · 728 × 90', width: 190, fontSize: 22, fontWeight: 600 },
  // Italic is its own font file with its own advances (ADR 0003).
  { text: 'Summer sale on every running shoe in the store', width: 300, fontSize: 32, fontWeight: 700, fontStyle: 'italic' },
  { text: 'The quick brown fox jumps over the lazy dog', width: 180, fontSize: 24, fontWeight: 300, fontStyle: 'italic' },
  { text: 'Italic letter spacing changes where lines break', width: 240, fontSize: 28, fontWeight: 400, fontStyle: 'italic', letterSpacing: 3 },
  { text: 'AutoFit shrinks this long italic headline to fit', width: 260, height: 90, fontSize: 72, fontWeight: 900, fontStyle: 'italic', autoFit: { minFontSize: 12 } },
  { text: 'Uppercase is wider, so it breaks sooner', width: 260, fontSize: 30, fontWeight: 700, textTransform: 'uppercase' },
  { text: 'Straße größer: ß becomes SS when uppercased', width: 250, height: 80, fontSize: 48, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, autoFit: { minFontSize: 10 } },
  { text: 'LOWERCASE HEADLINE, Lowercased By Core', width: 220, fontSize: 30, fontWeight: 500, textTransform: 'lowercase' },
]

const layers: TextLayer[] = CORPUS.map((c, i) => ({ ...base, ...c, id: `text-${i + 1}` }))
const doc = { version: 2 as const, name: 'corpus', canvas: { width: 800, height: 600, background: '#ffffff' }, layers }

test('Fabric Textbox line breaks and font size equal core Text Layout across the corpus', async ({ harness }) => {
  const results = await harness.evaluate(async (document) => {
    const { createEditor, core, fonts, host } = window.bannerkit
    const editor = createEditor()
    editor.mount(host())
    await editor.load(document)
    return document.layers.map((layer) => {
      const textbox = editor.objectFor(layer.id) as unknown as { textLines: string[]; fontSize: number }
      const layout = core.layoutText(layer as TextLayer, fonts.measureText)
      return {
        id: layer.id,
        fabric: { fontSize: textbox.fontSize, lines: textbox.textLines },
        core: { fontSize: layout.fontSize, lines: layout.lines.map((l) => l.text) },
      }
    })
  }, doc)

  for (const r of results) expect(r.fabric, r.id).toEqual(r.core)
  // the corpus really exercises wrapping and AutoFit
  expect(results.filter((r) => r.core.lines.length > 1).length).toBeGreaterThan(10)
  expect(results.some((r) => r.core.fontSize < (CORPUS[Number(r.id.slice(5)) - 1]!.fontSize))).toBe(true)
})

test('every font the Document uses is loaded before text is created, and is not a fallback', async ({ harness }) => {
  const result = await harness.evaluate(async (document) => {
    const { createEditor, fonts, host } = window.bannerkit
    const checks: { face: string; loaded: boolean }[] = []
    let textExisted = false
    const editor = createEditor({
      loadFonts: async (faces) => {
        await fonts.loadBrowserFonts(faces)
        textExisted ||= document.layers.some((l) => editor.objectFor(l.id) !== undefined)
        for (const f of faces) {
          checks.push({ face: `${f.family}/${f.weight}/${f.style}`, loaded: window.document.fonts.check(fonts.cssFont(f, 40)) })
        }
      },
    })
    editor.mount(host())
    await editor.load(document)

    // Measure each face the Document uses with its own family and with a family no
    // @font-face declares (which the browser silently replaces by a fallback).
    const sample = 'Hamburgefonstiv 0123456789'
    const used = fonts.facesUsed(document)
    const widths = (family?: string) =>
      used.map((f) => fonts.measureText({ ...f, family: family ?? f.family, size: 40 }, sample, 0))
    return { checks, textExisted, used: used.length, real: widths(), unregistered: widths('BannerkitUnregisteredFamily') }
  }, doc)

  expect(result.textExisted).toBe(false)
  expect(result.checks).toHaveLength(result.used)
  for (const c of result.checks) expect(c, c.face).toEqual({ face: c.face, loaded: true })
  result.real.forEach((width, i) => expect(width, `face #${i}`).not.toBeCloseTo(result.unregistered[i]!, 1))
  // every weight and style measures differently, so none was synthesised from another
  expect(new Set(result.real).size).toBe(result.used)
})

test('the editor refuses to lay out text in a font missing from the manifest', async ({ harness }) => {
  const error = await harness.evaluate(async (document) => {
    const { createEditor, host } = window.bannerkit
    const editor = createEditor()
    editor.mount(host())
    return editor.load(document).then(
      () => 'loaded',
      (e: Error) => e.message,
    )
  }, { ...doc, layers: [{ ...layers[0]!, fontFamily: 'Comic Sans MS' }] })

  expect(error).toMatch(/Comic Sans MS.*not in the font manifest/)
})
