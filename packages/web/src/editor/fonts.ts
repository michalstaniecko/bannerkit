// Browser fonts (ADR 0003): `@font-face` rules generated from fonts/fonts.json,
// pointing at the very TTF files the server registers, and core's `MeasureText`
// on a 2D canvas. Text is never measured or drawn with a fallback font: loading a
// face that is not in the manifest, or that the browser cannot load, throws.
import { parseFontManifest, walkLayers, type Document, type FontManifest, type MeasureText, type TextLayer } from '@bannerkit/core'
import { cache } from 'fabric'
import manifestJson from '../../../../fonts/fonts.json' with { type: 'json' }

/** One family/weight a Document uses. */
export type FontFaceRef = { family: string; weight: TextLayer['fontWeight'] }

/** Makes `faces` ready to measure and draw; resolves only once every face is loaded. */
export type LoadFonts = (faces: FontFaceRef[]) => Promise<void>

export const fontManifest: FontManifest = parseFontManifest(manifestJson)

// Vite serves (and, when building, copies) the TTFs next to the manifest unchanged.
const fileUrls = import.meta.glob<string>('../../../../fonts/*.ttf', { query: '?url', import: 'default', eager: true })

/** The URL of a manifest face's TTF file. */
export function fontFileUrl(file: string): string {
  const url = Object.entries(fileUrls).find(([path]) => path.endsWith(`/${file}`))?.[1]
  if (url === undefined) throw new Error(`font manifest: ${file} is not in fonts/`)
  return url
}

/** The `@font-face` rules for every face in the manifest. */
export function fontFaceCss(manifest: FontManifest = fontManifest): string {
  return manifest
    .map(
      (face) =>
        `@font-face { font-family: "${face.family}"; font-weight: ${face.weight}; font-style: ${face.style}; ` +
        `font-display: block; src: url("${fontFileUrl(face.file)}") format("truetype"); }`,
    )
    .join('\n')
}

/** The distinct family/weight pairs of a Document's text Layers. */
export function facesUsed(document: Document): FontFaceRef[] {
  const faces = new Map<string, FontFaceRef>()
  for (const { layer } of walkLayers(document)) {
    if (layer.type === 'text') faces.set(fontKey(layer.fontFamily, layer.fontWeight), { family: layer.fontFamily, weight: layer.fontWeight })
  }
  return [...faces.values()]
}

/** The CSS `font` shorthand for a face at `size` px. */
export const cssFont = (family: string, weight: number, size: number) => `${weight} ${size}px "${family}"`

const STYLE_ID = 'bannerkit-fonts'
const loaded = new Set<string>()
const fontKey = (family: string, weight: number) => `${family}/${weight}`

/**
 * The browser `LoadFonts`: installs the `@font-face` rules once, then awaits
 * `document.fonts.load()` for each face and checks it really loaded. Fabric caches
 * glyph widths per family, so the cache is cleared for every family that just
 * loaded, in case anything was measured with a fallback before.
 */
export const loadBrowserFonts: LoadFonts = async (faces) => {
  const doc = globalThis.document
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = fontFaceCss()
    doc.head.append(style)
  }
  const known = new Set(fontManifest.map((f) => fontKey(f.family, f.weight)))
  const fresh = new Set<string>()
  for (const { family, weight } of faces) {
    const key = fontKey(family, weight)
    if (!known.has(key)) throw new Error(`font ${family} ${weight} is not in the font manifest; refusing to fall back`)
    if (loaded.has(key)) continue
    const spec = cssFont(family, weight, 16)
    const matched = await doc.fonts.load(spec)
    if (matched.length === 0 || !doc.fonts.check(spec)) throw new Error(`font ${family} ${weight} failed to load`)
    loaded.add(key)
    fresh.add(family)
  }
  for (const family of fresh) cache.clearFontCache(family)
}

let scratch: CanvasRenderingContext2D | undefined

/** core's `MeasureText` on a 2D canvas: `measureText` with `ctx.letterSpacing`, like the server. */
export const measureText: MeasureText = (font, text, letterSpacing) => {
  scratch ??= globalThis.document.createElement('canvas').getContext('2d')!
  scratch.font = cssFont(font.family, font.weight, font.size)
  scratch.letterSpacing = `${letterSpacing}px`
  // Unhinted advances, as the editor's Textbox measures and draws them (see mapper.ts).
  scratch.textRendering = 'geometricPrecision'
  return scratch.measureText(text).width
}
