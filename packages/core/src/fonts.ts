import { z } from 'zod'
import { FONT_WEIGHTS } from './document.ts'
import { closest } from './suggest.ts'
import { layoutText, type MeasureText } from './textLayout.ts'
import type { DocumentRule, RuleIssue } from './validate.ts'

// Font manifest (ADR 0003): `fonts/fonts.json` lists every font face both
// renderers may use. Weights are never synthesised, so a Document may only use
// family/weight pairs listed here. Core only knows the shape; reading the file
// and registering the TTFs is each renderer's job.

export const FontFaceSchema = z.strictObject({
  family: z.string().min(1),
  weight: z.literal(FONT_WEIGHTS),
  style: z.literal('normal'),
  /** TTF file name, relative to the manifest. */
  file: z.string().min(1),
})

export const FontManifestSchema = z.array(FontFaceSchema).min(1)

export type FontFace = z.infer<typeof FontFaceSchema>
export type FontManifest = FontFace[]

/** Parses an untrusted manifest, throwing on a bad shape or a family/weight listed twice. */
export function parseFontManifest(value: unknown): FontManifest {
  const manifest = FontManifestSchema.parse(value)
  const seen = new Set<string>()
  for (const face of manifest) {
    const key = `${face.family}/${face.weight}`
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
  const faces = new Set(manifest.map((f) => `${f.family}/${f.weight}`))
  return (document) =>
    document.layers.flatMap((layer, i): RuleIssue[] => {
      if (layer.type !== 'text' || !faces.has(`${layer.fontFamily}/${layer.fontWeight}`)) return []
      if (!layoutText(layer, measure).overflow) return []
      const at = layer.autoFit ? `even at autoFit.minFontSize ${layer.autoFit.minFontSize}px` : `at fontSize ${layer.fontSize}px`
      return [{ path: `layers[${i}].text`, message: `text overflows its Box ${at}; it renders clipped`, severity: 'warning' }]
    })
}

/** A validation rule: every text Layer's family/weight pair is in `manifest`. */
export function fontsInManifest(manifest: FontManifest): DocumentRule {
  const weights = new Map<string, number[]>()
  for (const face of manifest) weights.set(face.family, [...(weights.get(face.family) ?? []), face.weight])
  const families = [...weights.keys()]

  return (document) =>
    document.layers.flatMap((layer, i): RuleIssue[] => {
      if (layer.type !== 'text') return []
      const available = weights.get(layer.fontFamily)
      if (available === undefined) {
        const issue: RuleIssue = {
          path: `layers[${i}].fontFamily`,
          message: `font family "${layer.fontFamily}" is not in the font manifest (available: ${families.join(', ')})`,
        }
        const suggestion = closest(layer.fontFamily, families)
        return [suggestion === undefined ? issue : { ...issue, suggestion }]
      }
      if (available.includes(layer.fontWeight)) return []
      return [
        {
          path: `layers[${i}].fontWeight`,
          message: `font "${layer.fontFamily}" has no weight ${layer.fontWeight} in the font manifest (available: ${[...available].sort((a, b) => a - b).join(', ')})`,
        },
      ]
    })
}
