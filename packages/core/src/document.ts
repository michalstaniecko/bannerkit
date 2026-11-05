import { z } from 'zod'
import { MAX_CANVAS_SIDE } from './presets.ts'

// Document schema v1, frozen. Changing the shape of a Document means a new
// `version`, not an edit here. Cross-field rules (unique ids, autoFit needs
// height, ...) live in validate.ts, not in this schema, so the generated JSON
// Schema stays a plain description of the shape.

export const DOCUMENT_VERSION = 1

/** CSS colour string as understood by both renderers (e.g. `#ff0000`, `rgba(0,0,0,0.5)`). */
export const ColorSchema = z.string().min(1).meta({ description: 'CSS colour, e.g. "#ff0000" or "rgba(0,0,0,0.5)"' })

export const LinearGradientSchema = z
  .strictObject({
    type: z.literal('linear'),
    angle: z.number().meta({ description: 'Degrees, CSS convention: 0 = to top, 90 = to right' }),
    stops: z
      .array(z.tuple([ColorSchema, z.number().min(0).max(1)]))
      .min(2)
      .meta({ description: '[colour, offset 0-1] pairs' }),
  })
  .meta({ id: 'LinearGradient' })

export const ShadowSchema = z.strictObject({
  color: ColorSchema,
  blur: z.number().min(0),
  offsetX: z.number(),
  offsetY: z.number(),
})

export const CanvasSchema = z.strictObject({
  width: z.number().int().min(1).max(MAX_CANVAS_SIDE),
  height: z.number().int().min(1).max(MAX_CANVAS_SIDE),
  background: ColorSchema.nullable(),
})

/** Fields every Layer has. `x`/`y` are the top-left of the unrotated Box. */
const commonShape = {
  id: z.string().min(1).meta({ description: 'Unique within the Document; readable `<type>-<n>` when generated' }),
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  rotation: z.number().optional().meta({ description: 'Degrees around the Box centre, default 0' }),
  opacity: z.number().min(0).max(1).optional().meta({ description: '0-1, default 1' }),
  visible: z.boolean().optional().meta({ description: 'Default true' }),
  locked: z.boolean().optional().meta({ description: 'Default false' }),
  shadow: ShadowSchema.optional(),
}

export const RectLayerSchema = z
  .strictObject({
    ...commonShape,
    type: z.literal('rect'),
    height: z.number().min(0),
    fill: z.union([ColorSchema, LinearGradientSchema], {
      error: 'expected a CSS colour string or a LinearGradient object',
    }),
    cornerRadius: z.number().min(0).optional(),
  })
  .meta({ id: 'RectLayer' })

export const FITS = ['contain', 'cover', 'stretch'] as const

export const ImageLayerSchema = z
  .strictObject({
    ...commonShape,
    type: z.literal('image'),
    height: z.number().min(0),
    src: z.string().min(1).meta({ description: 'Project-relative Asset path, e.g. "assets/shoe.png"' }),
    fit: z.enum(FITS),
  })
  .meta({ id: 'ImageLayer' })

export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const

export const TextLayerSchema = z
  .strictObject({
    ...commonShape,
    type: z.literal('text'),
    text: z.string(),
    height: z.number().min(0).optional().meta({ description: 'Required when autoFit is set' }),
    fontFamily: z.string().min(1),
    fontWeight: z.literal(FONT_WEIGHTS),
    fontSize: z.number().positive(),
    lineHeight: z.number().positive().optional().meta({ description: 'Multiple of fontSize' }),
    letterSpacing: z.number().optional().meta({ description: 'Pixels' }),
    fill: ColorSchema,
    align: z.enum(['left', 'center', 'right']).optional(),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
    autoFit: z
      .strictObject({ minFontSize: z.number().positive() })
      .optional()
      .meta({ description: 'Shrink fontSize down to minFontSize until the text fits its Box; requires height' }),
  })
  .meta({ id: 'TextLayer' })

export const LAYER_TYPES = ['rect', 'image', 'text'] as const

export const LayerSchema = z.discriminatedUnion('type', [RectLayerSchema, ImageLayerSchema, TextLayerSchema])

export const DocumentSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(DOCUMENT_VERSION),
    name: z.string().min(1),
    canvas: CanvasSchema,
    layers: z.array(LayerSchema).meta({ description: 'Bottom to top' }),
  })
  .meta({ title: 'Bannerkit Document v1' })

export type Color = z.infer<typeof ColorSchema>
export type LinearGradient = z.infer<typeof LinearGradientSchema>
export type Shadow = z.infer<typeof ShadowSchema>
export type Canvas = z.infer<typeof CanvasSchema>
export type RectLayer = z.infer<typeof RectLayerSchema>
export type ImageLayer = z.infer<typeof ImageLayerSchema>
export type TextLayer = z.infer<typeof TextLayerSchema>
export type Layer = z.infer<typeof LayerSchema>
export type LayerType = Layer['type']
export type Fit = ImageLayer['fit']
export type Document = z.infer<typeof DocumentSchema>

export const DEFAULT_BACKGROUND = '#ffffff'
