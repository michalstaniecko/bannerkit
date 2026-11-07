import { z } from 'zod'
import { FONT_STYLES, FONT_WEIGHTS, type FontStyle, type TextLayer } from './document.ts'
import { closest } from './suggest.ts'
import { layoutText, type MeasureText } from './textLayout.ts'
import { walkLayers } from './tree.ts'
import type { DocumentRule, RuleIssue } from './validate.ts'

// Font manifest (ADR 0003): `fonts/fonts.json` lists every font face both
// renderers may use. Weights and italics are never synthesised, so a Document
// may only use family/weight/style faces listed here. Core only knows the
// shape; reading the file and registering the TTFs is each renderer's job.

export const FontFaceSchema = z.strictObject({
  family: z.string().min(1),
  weight: z.literal(FONT_WEIGHTS),
  style: z.enum(FONT_STYLES),
  /** TTF file name, relative to the manifest. */
  file: z.string().min(1),
})

export const FontManifestSchema = z.array(FontFaceSchema).min(1)

export type FontFace = z.infer<typeof FontFaceSchema>
export type FontManifest = FontFace[]

/** The manifest key of a face: `family/weight/style`. */
export function faceKey(face: { family: string; weight: number; style: FontStyle }): string {
  return `${face.family}/${face.weight}/${face.style}`
}

/** The face a text Layer is drawn with. */
export function layerFace(layer: TextLayer): Omit<FontFace, 'file'> {
  return { family: layer.fontFamily, weight: layer.fontWeight, style: fontStyleOf(layer) }
}

/** Parses an untrusted manifest, throwing on a bad shape or a family/weight/style listed twice. */
export function parseFontManifest(value: unknown): FontManifest {
  const manifest = FontManifestSchema.parse(value)
  const seen = new Set<string>()
  for (const face of manifest) {
    const key = faceKey(face)
    if (seen.has(key)) throw new Error(`font manifest: duplicate face ${key}`)
    seen.add(key)
  }
  return manifest
}

/**
 * A warning rule: text Layers whose Text Layout overflows the Box (at
 * `autoFit.minFontSize` when AutoFit is on). Overflowing text still renders,
 * clipped. Layers whose font is not in `manifest` are left to `fontsInManifest`.
 */
export function textOverflow(manifest: FontManifest, measure: MeasureText): DocumentRule {
  const faces = new Set(manifest.map(faceKey))
  return (document) =>
    walkLayers(document).flatMap(({ layer, path }): RuleIssue[] => {
      if (layer.type !== 'text' || !faces.has(faceKey(layerFace(layer)))) return []
      if (!layoutText(layer, measure).overflow) return []
      const at = layer.autoFit ? `even at autoFit.minFontSize ${layer.autoFit.minFontSize}px` : `at fontSize ${layer.fontSize}px`
      return [{ path: `${path}.text`, message: `text overflows its Box ${at}; it renders clipped`, severity: 'warning' }]
    })
}

/**
 * A validation rule: every text Layer's family/weight/style face is in
 * `manifest`. A missing style (e.g. no italic file for that weight) is an error
 * listing the weights that have it: italics are never slanted synthetically.
 */
export function fontsInManifest(manifest: FontManifest): DocumentRule {
  const weights = new Map<string, number[]>()
  for (const face of manifest) weights.set(face.family, [...(weights.get(face.family) ?? []), face.weight])
  const families = [...weights.keys()]
  const faces = new Set(manifest.map(faceKey))
  const list = (values: number[]) => [...new Set(values)].sort((a, b) => a - b).join(', ')

  return (document) =>
    walkLayers(document).flatMap(({ layer, path }): RuleIssue[] => {
      if (layer.type !== 'text') return []
      const available = weights.get(layer.fontFamily)
      if (available === undefined) {
        const issue: RuleIssue = {
          path: `${path}.fontFamily`,
          message: `font family "${layer.fontFamily}" is not in the font manifest (available: ${families.join(', ')})`,
        }
        const suggestion = closest(layer.fontFamily, families)
        return [suggestion === undefined ? issue : { ...issue, suggestion }]
      }
      if (!available.includes(layer.fontWeight)) {
        return [
          {
            path: `${path}.fontWeight`,
            message: `font "${layer.fontFamily}" has no weight ${layer.fontWeight} in the font manifest (available: ${list(available)})`,
          },
        ]
      }
      const face = layerFace(layer)
      if (faces.has(faceKey(face))) return []
      const withStyle = manifest.filter((f) => f.family === face.family && f.style === face.style).map((f) => f.weight)
      return [
        {
          path: `${path}.fontStyle`,
          message: `font "${face.family}" has no ${face.style} for weight ${face.weight} in the font manifest (${face.style} available for weights: ${withStyle.length > 0 ? list(withStyle) : 'none'})`,
        },
      ]
    })
}

/** A text Layer's style: `fontStyle`, which defaults to normal. */
export function fontStyleOf(layer: Pick<TextLayer, 'fontStyle'>): FontStyle {
  return layer.fontStyle ?? 'normal'
}
