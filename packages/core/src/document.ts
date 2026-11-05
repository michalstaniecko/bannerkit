import { z } from 'zod'
import { MAX_CANVAS_SIDE } from './presets.ts'

// Initial Document schema: Canvas plus solid-colour rect Layers. Ticket 02
// replaces this with the full, frozen schema v1 from the spec (all Layer types,
// gradients, did-you-mean hints, cross-field rules, generated JSON Schema).

export const DOCUMENT_VERSION = 1

/** CSS colour string as understood by both renderers (e.g. `#ff0000`, `rgba(0,0,0,0.5)`). */
export const ColorSchema = z.string().min(1)

export const CanvasSchema = z.strictObject({
  width: z.number().int().min(1).max(MAX_CANVAS_SIDE),
  height: z.number().int().min(1).max(MAX_CANVAS_SIDE),
  background: ColorSchema.nullable(),
})

export const RectLayerSchema = z.strictObject({
  id: z.string().min(1),
  type: z.literal('rect'),
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
  fill: ColorSchema,
})

export const LayerSchema = z.discriminatedUnion('type', [RectLayerSchema])

export const DocumentSchema = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(DOCUMENT_VERSION),
  name: z.string().min(1),
  canvas: CanvasSchema,
  layers: z.array(LayerSchema),
})

export type Canvas = z.infer<typeof CanvasSchema>
export type RectLayer = z.infer<typeof RectLayerSchema>
export type Layer = z.infer<typeof LayerSchema>
export type Document = z.infer<typeof DocumentSchema>

export const DEFAULT_BACKGROUND = '#ffffff'
