import { z } from 'zod'
import { MAX_CANVAS_SIDE } from './presets.ts'

// Document schemas. v1 is frozen: files with `version: 1` are checked by
// `DocumentV1Schema` and lifted to v2 in memory (migrate.ts). The current
// shape is v2 (`DocumentSchema`); changing it in a breaking way means a new
// `version`. Cross-field rules (unique ids, autoFit needs height, ...) live in
// validate.ts, not in these schemas, so the generated JSON Schema stays a plain
// description of the shape. Shared building blocks (colour, gradient, shadow,
// Canvas) are the same in both versions.

/** The version every Document is read as and written with. */
export const DOCUMENT_VERSION = 2

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

// v1 (frozen) ------------------------------------------------------------------
// No `.meta({ id })` here: the ids name the v2 definitions in the JSON Schema.

const RectLayerV1Schema = z.strictObject({
  ...commonShape,
  type: z.literal('rect'),
  height: z.number().min(0),
  fill: z.union([ColorSchema, LinearGradientSchema], {
    error: 'expected a CSS colour string or a LinearGradient object',
  }),
  cornerRadius: z.number().min(0).optional(),
})

export const FITS = ['contain', 'cover', 'stretch'] as const

const ImageLayerV1Schema = z.strictObject({
  ...commonShape,
  type: z.literal('image'),
  height: z.number().min(0),
  src: z.string().min(1).meta({ description: 'Project-relative Asset path, e.g. "assets/shoe.png"' }),
  fit: z.enum(FITS),
})

export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const

const TextLayerV1Schema = z.strictObject({
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

const LayerV1Schema = z.discriminatedUnion('type', [RectLayerV1Schema, ImageLayerV1Schema, TextLayerV1Schema])

/** Document v1, frozen. Only read (and lifted to v2), never written. */
export const DocumentV1Schema = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1),
  name: z.string().min(1),
  canvas: CanvasSchema,
  layers: z.array(LayerV1Schema).meta({ description: 'Bottom to top' }),
})

// v2 (current) -----------------------------------------------------------------

export const RectLayerSchema = RectLayerV1Schema.meta({ id: 'RectLayer' })
export const ImageLayerSchema = ImageLayerV1Schema.meta({ id: 'ImageLayer' })
export const TextLayerSchema = TextLayerV1Schema.meta({ id: 'TextLayer' })

/** Every Layer type in Document v2: the leaf types plus `group`. */
export const LAYER_TYPES = ['rect', 'image', 'text', 'group'] as const

/**
 * A Group (ADR 0007): an ordered list of child Layers, nested to any depth.
 * No Box of its own: the children keep Canvas coordinates and the Group's Box
 * is derived from them (`layerExtent`). Its opacity applies to the children
 * drawn together, as in CSS, not to each child.
 */
export const GroupLayerSchema = z
  .strictObject({
    id: commonShape.id,
    type: z.literal('group'),
    name: z.string().optional().meta({ description: 'Shown in the Layer list instead of the id' }),
    visible: commonShape.visible,
    locked: commonShape.locked,
    opacity: z.number().min(0).max(1).optional().meta({ description: '0-1, default 1; applies to the children composited together' }),
    get layers(): z.ZodArray<typeof LayerSchema> {
      return z.array(LayerSchema).min(1, 'a Group needs at least one Layer').meta({ description: 'Children, bottom to top' })
    },
  })
  .meta({ id: 'GroupLayer' })

export const LayerSchema: z.ZodDiscriminatedUnion<
  [typeof RectLayerSchema, typeof ImageLayerSchema, typeof TextLayerSchema, typeof GroupLayerSchema],
  'type'
> = z
  .discriminatedUnion('type', [RectLayerSchema, ImageLayerSchema, TextLayerSchema, GroupLayerSchema])
  .meta({ id: 'Layer' })

const GuideAxisSchema = z.array(z.number()).meta({ description: 'Document px, any order' })

/** Editor-only alignment lines. Never rendered. */
export const GuidesSchema = z
  .strictObject({
    x: GuideAxisSchema.meta({ description: 'Vertical Guides: x positions in Document px' }),
    y: GuideAxisSchema.meta({ description: 'Horizontal Guides: y positions in Document px' }),
  })
  .meta({ id: 'Guides', description: 'Editor-only alignment lines; never rendered' })

export const DocumentSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(DOCUMENT_VERSION),
    name: z.string().min(1),
    canvas: CanvasSchema,
    guides: GuidesSchema.optional(),
    layers: z.array(LayerSchema).meta({ description: 'Bottom to top' }),
  })
  .meta({ title: 'Bannerkit Document v2' })

export type Color = z.infer<typeof ColorSchema>
export type LinearGradient = z.infer<typeof LinearGradientSchema>
export type Shadow = z.infer<typeof ShadowSchema>
export type Canvas = z.infer<typeof CanvasSchema>
export type RectLayer = z.infer<typeof RectLayerSchema>
export type ImageLayer = z.infer<typeof ImageLayerSchema>
export type TextLayer = z.infer<typeof TextLayerSchema>
export type GroupLayer = z.infer<typeof GroupLayerSchema>
export type Layer = z.infer<typeof LayerSchema>
export type LayerType = Layer['type']
/** A Layer that draws something itself, with a Box of its own: anything but a Group. */
export type LeafLayer = Exclude<Layer, GroupLayer>
export type Fit = ImageLayer['fit']
export type Guides = z.infer<typeof GuidesSchema>
export type Document = z.infer<typeof DocumentSchema>
export type DocumentV1 = z.infer<typeof DocumentV1Schema>

export const DEFAULT_BACKGROUND = '#ffffff'
