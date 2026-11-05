import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseFontManifest, type FontManifest, type FontSpec, type MeasureText } from '@bannerkit/core'
import { Canvas, FontLibrary, type CanvasRenderingContext2D } from 'skia-canvas'

// Server fonts (ADR 0003): every face in fonts/fonts.json is registered
// explicitly with skia-canvas, and text is only measured or drawn with a
// registered family/weight. skia-canvas would otherwise fall back silently to a
// system font, so the check happens here, before every measure and draw.

/** The bundled fonts folder at the repo root, holding fonts.json and the TTFs. */
export const FONTS_DIR = resolve(import.meta.dirname, '../../../../fonts')

let manifest: FontManifest | undefined
const registered = new Set<string>()
const key = (family: string, weight: number) => `${family}/${weight}`

/** The parsed font manifest; its faces are registered with skia-canvas on first use. */
export function fontManifest(): FontManifest {
  if (manifest) return manifest
  const faces = parseFontManifest(JSON.parse(readFileSync(join(FONTS_DIR, 'fonts.json'), 'utf8')))
  for (const face of faces) {
    const fonts = FontLibrary.use(face.family, [join(FONTS_DIR, face.file)])
    const font = fonts[0]
    if (fonts.length !== 1 || font?.weight !== face.weight || font.style !== face.style) {
      throw new Error(`font manifest: ${face.file} is not ${face.family} ${face.weight} ${face.style}`)
    }
    registered.add(key(face.family, face.weight))
  }
  manifest = faces
  return faces
}

/** Throws unless `family`/`weight` is registered from the manifest (no fallback fonts). */
export function requireFont(family: string, weight: number): void {
  fontManifest()
  if (!registered.has(key(family, weight))) {
    throw new Error(`font ${family} ${weight} is not registered from the font manifest; refusing to fall back`)
  }
}

/** Sets `ctx.font` and `ctx.letterSpacing` for drawing or measuring with a manifest font. */
export function applyFont(ctx: CanvasRenderingContext2D, font: FontSpec, letterSpacing: number): void {
  requireFont(font.family, font.weight)
  ctx.font = `${font.weight} ${font.size}px "${font.family}"`
  ctx.letterSpacing = `${letterSpacing}px`
}

let scratch: CanvasRenderingContext2D | undefined

/** core's `MeasureText` on skia-canvas: canvas `measureText` with `ctx.letterSpacing`. */
export const measureText: MeasureText = (font, text, letterSpacing) => {
  scratch ??= new Canvas(1, 1, { gpu: false }).getContext('2d')
  applyFont(scratch, font, letterSpacing)
  return scratch.measureText(text).width
}
