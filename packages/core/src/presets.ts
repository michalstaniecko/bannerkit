import { z } from 'zod'

export type Size = { width: number; height: number }

/** Named standard Canvas sizes. A Preset's id is its `WxH` string. */
export const PRESETS = {
  '1200x628': { width: 1200, height: 628 },
  '1080x1080': { width: 1080, height: 1080 },
  '1080x1920': { width: 1080, height: 1920 },
  '300x250': { width: 300, height: 250 },
  '728x90': { width: 728, height: 90 },
} as const satisfies Record<string, Size>

export type PresetId = keyof typeof PRESETS
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

export const PresetIdSchema = z.enum(PRESET_IDS as [PresetId, ...PresetId[]])

/** Largest Canvas side, a sanity bound that keeps 2× supersampled renders in memory. */
export const MAX_CANVAS_SIDE = 8192

export const SizeSchema = z.object({
  width: z.number().int().min(1).max(MAX_CANVAS_SIDE),
  height: z.number().int().min(1).max(MAX_CANVAS_SIDE),
})

/** Either a Preset or a custom size, as accepted by Document-creating operations. */
export type SizeChoice = { preset?: PresetId; size?: Size }

export const sizeChoiceShape = {
  preset: PresetIdSchema.optional(),
  size: SizeSchema.optional(),
}

/** Arguments for `.refine(...)` on any object spreading `sizeChoiceShape`. */
export const exactlyOneSize: [(choice: SizeChoice) => boolean, { message: string; path: PropertyKey[] }] = [
  (choice) => (choice.preset === undefined) !== (choice.size === undefined),
  { message: 'give exactly one of preset or size', path: ['preset'] },
]

export function resolveSize(choice: SizeChoice): Size {
  if (choice.preset !== undefined) return { ...PRESETS[choice.preset] }
  if (choice.size !== undefined) return { width: choice.size.width, height: choice.size.height }
  throw new Error('resolveSize: neither preset nor size given')
}

/** Parses a `WxH` string such as `1200x628` (also accepts `×`). Returns undefined if malformed. */
export function parseSize(text: string): Size | undefined {
  const match = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(text)
  if (!match) return undefined
  return { width: Number(match[1]), height: Number(match[2]) }
}

export const formatSize = ({ width, height }: Size) => `${width}x${height}`
