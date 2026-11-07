// The Inspector's fields, described as data: for each Layer type, titled groups of
// fields, each with its control, range and how it reads and writes the Layer. The
// Properties tab only renders these, so a new field (a later ticket, M2's Group,
// `textTransform`, `fontStyle`) is a new entry here, not a change to the Inspector.
//
// Ranges come from the Document schema. A write returns the next Layer; an optional
// field written with its default value leaves the key out of the Document.
import {
  DEFAULT_LINE_HEIGHT,
  FITS,
  RectLayerSchema,
  ShadowSchema,
  TextLayerSchema,
  type Fit,
  type FontManifest,
  type Shadow,
  type ImageLayer,
  type Layer,
  type LayerType,
  type LinearGradient,
  type RectLayer,
  type TextLayer,
} from '@bannerkit/core'
import { fontManifest } from '../editor/fonts.ts'
import { roundAngle, roundPx } from '../editor/rounding.ts'
import type { SelectOption } from '../ui/Select.tsx'

type FieldBase<L extends Layer = Layer> = {
  /** Stable id of the field, unique within its Layer type (and shared across types for the same field). */
  key: string
  /** Shown beside the control. */
  label: string
  /** Accessible name of the control; defaults to `label`. */
  name?: string
  /** The field is shown only when this holds (e.g. shadow blur while the shadow is on). Default: always. */
  when?: (layer: L) => boolean
}

/** A number typed (or stepped with the arrow keys) in a NumberField. */
export type NumberFieldSpec<L extends Layer = Layer> = FieldBase<L> & {
  control: 'number'
  min?: number
  max?: number
  /** Arrow keys step by this (Shift: ×10). Default 1. */
  step?: number
  /** Applied to a typed value before it is written (e.g. whole px). */
  round?: (value: number) => number
  /** Shown in place of a missing value. */
  placeholder?: string
  /**
   * The field is this side of the Layer's Box. With several Layers in the Inspector
   * it stands for their shared Box instead (see `inspectField`): `x`/`y` move every
   * Layer by one delta, `width`/`height` are shown but disabled.
   */
  box?: 'x' | 'y' | 'width' | 'height'
  read: (layer: L) => number | undefined
  write: (layer: L, value: number) => L
}

/** An on/off switch. */
export type ToggleFieldSpec<L extends Layer = Layer> = FieldBase<L> & {
  control: 'toggle'
  read: (layer: L) => boolean
  write: (layer: L, value: boolean) => L
}

/** A value shown but never edited (the Layer id). */
export type ReadOnlyFieldSpec<L extends Layer = Layer> = FieldBase<L> & {
  control: 'readonly'
  read: (layer: L) => string
}

/** One of a set of options, picked from a Select. */
export type SelectFieldSpec<L extends Layer = Layer> = FieldBase<L> & {
  control: 'select'
  /** The options, or the options a Layer can take (e.g. the weights of its font family). */
  options: readonly SelectOption[] | ((layer: L) => readonly SelectOption[])
  read: (layer: L) => string
  write: (layer: L, value: string) => L
}

/** A CSS colour, typed or picked in a ColorField; `null` is "none" (only when `nullable`). */
export type ColorFieldSpec<L extends Layer = Layer> = FieldBase<L> & {
  control: 'color'
  nullable?: boolean
  /** Shown when `read` gives `undefined` (e.g. a gradient fill). */
  placeholder?: string
  read: (layer: L) => string | null | undefined
  write: (layer: L, value: string | null) => L
}

/** A linear gradient (angle and stops) edited in the gradient editor. */
export type GradientFieldSpec<L extends Layer = Layer> = FieldBase<L> & {
  control: 'gradient'
  read: (layer: L) => LinearGradient | undefined
  write: (layer: L, value: LinearGradient) => L
}

export type FieldSpec<L extends Layer = Layer> =
  | ColorFieldSpec<L>
  | GradientFieldSpec<L>
  | NumberFieldSpec<L>
  | ToggleFieldSpec<L>
  | ReadOnlyFieldSpec<L>
  | SelectFieldSpec<L>

/** A titled group of fields: one Section in the Inspector. */
export type FieldGroup<L extends Layer = Layer> = { key: string; title: string; fields: FieldSpec<L>[] }

type LayerOf<T extends LayerType> = Extract<Layer, { type: T }>

/** `layer` with optional `key` set to `value`, or left out when `value` is its default `fallback`. */
export function setOptional<L extends Layer, K extends keyof L>(layer: L, key: K, value: L[K], fallback: L[K]): L {
  const next = { ...layer }
  if (value === fallback) delete next[key]
  else next[key] = value
  return next
}

const shape = RectLayerSchema.shape
const opacityRange = shape.opacity.unwrap()

/** The fields every Layer type has. */
function commonGroups<L extends Layer>(): FieldGroup<L>[] {
  return [
    {
      key: 'layer',
      title: 'Layer',
      fields: [{ control: 'readonly', key: 'id', label: 'ID', read: (l) => l.id }],
    },
    {
      key: 'layout',
      title: 'Layout',
      fields: [
        { control: 'number', key: 'x', label: 'X', box: 'x', round: roundPx, read: (l) => l.x, write: (l, x) => ({ ...l, x }) },
        { control: 'number', key: 'y', label: 'Y', box: 'y', round: roundPx, read: (l) => l.y, write: (l, y) => ({ ...l, y }) },
        {
          control: 'number',
          key: 'width',
          label: 'W',
          name: 'Width',
          box: 'width',
          min: shape.width.minValue ?? undefined,
          round: roundPx,
          read: (l) => l.width,
          write: (l, width) => ({ ...l, width }),
        },
        {
          control: 'number',
          key: 'height',
          label: 'H',
          name: 'Height',
          box: 'height',
          min: shape.height.minValue ?? undefined,
          round: roundPx,
          // A text Layer without `height` grows with its text (shown as Auto).
          placeholder: 'Auto',
          read: (l) => ('height' in l ? l.height : undefined),
          write: (l, height) => ({ ...l, height }),
        },
        {
          control: 'number',
          key: 'rotation',
          label: 'R',
          name: 'Rotation',
          step: 1,
          round: roundAngle,
          read: (l) => l.rotation ?? 0,
          write: (l, rotation) => setOptional<Layer, 'rotation'>(l, 'rotation', rotation, 0) as L,
        },
      ],
    },
    {
      key: 'appearance',
      title: 'Appearance',
      fields: [
        {
          control: 'number',
          key: 'opacity',
          label: 'Opacity',
          min: opacityRange.minValue ?? undefined,
          max: opacityRange.maxValue ?? undefined,
          step: 0.01,
          read: (l) => l.opacity ?? 1,
          write: (l, opacity) => setOptional<Layer, 'opacity'>(l, 'opacity', opacity, 1) as L,
        },
        {
          control: 'toggle',
          key: 'visible',
          label: 'Visible',
          read: (l) => l.visible ?? true,
          write: (l, visible) => setOptional<Layer, 'visible'>(l, 'visible', visible, true) as L,
        },
        {
          control: 'toggle',
          key: 'locked',
          label: 'Locked',
          read: (l) => l.locked ?? false,
          write: (l, locked) => setOptional<Layer, 'locked'>(l, 'locked', locked, false) as L,
        },
      ],
    },
    shadowGroup<L>(),
  ]
}

/** The shadow a Layer gets when its Shadow switch is turned on. */
export const DEFAULT_SHADOW: Shadow = { color: 'rgba(0,0,0,0.5)', blur: 8, offsetX: 0, offsetY: 4 }

const shadowShape = ShadowSchema.shape

/** A number of the Layer's shadow, shown while the shadow is on. */
function shadowNumber<L extends Layer>(
  key: 'blur' | 'offsetX' | 'offsetY',
  label: string,
  name: string,
  min?: number,
): NumberFieldSpec<L> {
  return {
    control: 'number',
    key: `shadow.${key}`,
    label,
    name,
    min,
    when: (l) => l.shadow !== undefined,
    read: (l) => l.shadow?.[key],
    write: (l, value) => (l.shadow ? { ...l, shadow: { ...l.shadow, [key]: value } } : l),
  }
}

/** Every Layer's shadow: a switch (off removes the key) and, while on, its fields. */
function shadowGroup<L extends Layer>(): FieldGroup<L> {
  return {
    key: 'shadow',
    title: 'Shadow',
    fields: [
      {
        control: 'toggle',
        key: 'shadow',
        label: 'Shadow',
        read: (l) => l.shadow !== undefined,
        write: (l, on) => {
          const next = { ...l }
          if (on) next.shadow = l.shadow ?? { ...DEFAULT_SHADOW }
          else delete next.shadow
          return next
        },
      },
      {
        control: 'color',
        key: 'shadow.color',
        label: 'Color',
        name: 'Shadow color',
        when: (l) => l.shadow !== undefined,
        read: (l) => l.shadow?.color,
        write: (l, color) => (l.shadow && color !== null ? { ...l, shadow: { ...l.shadow, color } } : l),
      },
      shadowNumber<L>('blur', 'Blur', 'Blur', shadowShape.blur.minValue ?? undefined),
      shadowNumber<L>('offsetX', 'X', 'Offset X'),
      shadowNumber<L>('offsetY', 'Y', 'Offset Y'),
    ],
  }
}

/** The gradient a rect's colour fill becomes when its fill type is switched to Linear gradient. */
export function gradientFrom(color: string): LinearGradient {
  return { type: 'linear', angle: 90, stops: [[color, 0], ['#ffffff', 1]] }
}

/**
 * The colour `fill` of a rect or text Layer, shared by both in the `fill` group so a
 * Selection of both shows it. A gradient shows as the placeholder (Mixed with several
 * Layers); a colour set on it replaces the gradient.
 */
function fillColor<L extends RectLayer | TextLayer>(): ColorFieldSpec<L> {
  return {
    control: 'color',
    key: 'fill',
    label: 'Fill',
    placeholder: 'Gradient',
    read: (l) => (typeof l.fill === 'string' ? l.fill : undefined),
    write: (l, fill) => (fill === null ? l : { ...l, fill }),
  }
}

/** The fill of a text Layer: a colour only. */
function textFillGroup(): FieldGroup<TextLayer> {
  return { key: 'fill', title: 'Fill', fields: [fillColor<TextLayer>()] }
}

/** The fill of a rect: a colour, or a linear gradient with its own editor. */
function rectFillGroup(): FieldGroup<RectLayer> {
  return {
    key: 'fill',
    title: 'Fill',
    fields: [
      {
        control: 'select',
        key: 'fill.type',
        label: 'Type',
        name: 'Fill type',
        options: [
          { value: 'color', label: 'Color' },
          { value: 'linear', label: 'Linear gradient' },
        ],
        read: (l) => (typeof l.fill === 'string' ? 'color' : 'linear'),
        write: (l, type) => {
          if (type === 'color') return typeof l.fill === 'string' ? l : { ...l, fill: l.fill.stops[0]![0] }
          return typeof l.fill === 'string' ? { ...l, fill: gradientFrom(l.fill) } : l
        },
      },
      fillColor<RectLayer>(),
      {
        control: 'gradient',
        key: 'fill.gradient',
        label: 'Gradient',
        when: (l) => typeof l.fill !== 'string',
        read: (l) => (typeof l.fill === 'string' ? undefined : l.fill),
        write: (l, fill) => ({ ...l, fill }),
      },
    ],
  }
}

/** The fields of a rect Layer. */
function rectGroups(): FieldGroup<RectLayer>[] {
  return [
    rectFillGroup(),
    {
      key: 'rect',
      title: 'Rectangle',
      fields: [
        {
          control: 'number',
          key: 'cornerRadius',
          label: 'Radius',
          name: 'Corner radius',
          min: shape.cornerRadius.unwrap().minValue ?? undefined,
          read: (l) => l.cornerRadius ?? 0,
          write: (l, cornerRadius) => setOptional(l, 'cornerRadius', cornerRadius, 0),
        },
      ],
    },
  ]
}

/** The fields of an image Layer (its `src` is edited in the JSON tab). */
function imageGroups(): FieldGroup<ImageLayer>[] {
  return [
    {
      key: 'image',
      title: 'Image',
      fields: [
        {
          control: 'select',
          key: 'fit',
          label: 'Fit',
          options: FITS.map((fit) => ({ value: fit, label: fit[0]!.toUpperCase() + fit.slice(1) })),
          read: (l) => l.fit,
          write: (l, fit) => ({ ...l, fit: fit as Fit }),
        },
      ],
    },
  ]
}

/** Select options for `values`, each labelled with its value capitalised. */
const options = (values: readonly string[]): SelectOption[] =>
  values.map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }))

type FontWeight = TextLayer['fontWeight']
type Align = NonNullable<TextLayer['align']>
type VerticalAlign = NonNullable<TextLayer['verticalAlign']>
const textShape = TextLayerSchema.shape
const ALIGNS = textShape.align.unwrap().options
const VERTICAL_ALIGNS = textShape.verticalAlign.unwrap().options

/** The common name of each font weight, shown beside the number. */
const WEIGHT_NAMES: Record<FontWeight, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
}

/** The weights `manifest` has for `family`, lightest first. */
function weightsOf(manifest: FontManifest, family: string): FontWeight[] {
  const weights = manifest.filter((f) => f.family === family).map((f) => f.weight as FontWeight)
  return [...new Set(weights)].sort((a, b) => a - b)
}

/** The weight of `family` closest to `weight` (on a tie the heavier), or `weight` when it has none. */
export function nearestWeight(manifest: FontManifest, family: string, weight: FontWeight): FontWeight {
  const weights = weightsOf(manifest, family)
  if (weights.length === 0) return weight
  return weights.reduce((best, w) => (Math.abs(w - weight) <= Math.abs(best - weight) ? w : best))
}

/**
 * The typography of a text Layer (its text is edited on the Canvas). Font family and
 * weight are picked only from the family/weight pairs of `manifest`; a family without
 * the Layer's weight takes its nearest weight.
 */
function textGroups(manifest: FontManifest): FieldGroup<TextLayer>[] {
  const families = [...new Set(manifest.map((f) => f.family))]
  return [
    {
      key: 'text',
      title: 'Text',
      fields: [
        {
          control: 'select',
          key: 'fontFamily',
          label: 'Font',
          name: 'Font family',
          options: families.map((family) => ({ value: family, label: family })),
          read: (l) => l.fontFamily,
          write: (l, fontFamily) => ({ ...l, fontFamily, fontWeight: nearestWeight(manifest, fontFamily, l.fontWeight) }),
        },
        {
          control: 'select',
          key: 'fontWeight',
          label: 'Weight',
          name: 'Font weight',
          options: (l) => weightsOf(manifest, l.fontFamily).map((w) => ({ value: String(w), label: `${w} ${WEIGHT_NAMES[w]}` })),
          read: (l) => String(l.fontWeight),
          write: (l, weight) => ({ ...l, fontWeight: Number(weight) as FontWeight }),
        },
        {
          // The declared (largest) size; above 0, which the schema checks on write.
          control: 'number',
          key: 'fontSize',
          label: 'Size',
          name: 'Font size',
          read: (l) => l.fontSize,
          write: (l, fontSize) => ({ ...l, fontSize }),
        },
        {
          control: 'number',
          key: 'lineHeight',
          label: 'Line',
          name: 'Line height',
          step: 0.01,
          read: (l) => l.lineHeight ?? DEFAULT_LINE_HEIGHT,
          write: (l, lineHeight) => setOptional(l, 'lineHeight', lineHeight, DEFAULT_LINE_HEIGHT),
        },
        {
          control: 'number',
          key: 'letterSpacing',
          label: 'Spacing',
          name: 'Letter spacing',
          step: 0.1,
          read: (l) => l.letterSpacing ?? 0,
          write: (l, letterSpacing) => setOptional(l, 'letterSpacing', letterSpacing, 0),
        },
        {
          control: 'select',
          key: 'align',
          label: 'Align',
          options: options(ALIGNS),
          read: (l) => l.align ?? 'left',
          write: (l, align) => setOptional(l, 'align', align as Align, 'left'),
        },
        {
          control: 'select',
          key: 'verticalAlign',
          label: 'V align',
          name: 'Vertical align',
          options: options(VERTICAL_ALIGNS),
          read: (l) => l.verticalAlign ?? 'top',
          write: (l, verticalAlign) => setOptional(l, 'verticalAlign', verticalAlign as VerticalAlign, 'top'),
        },
      ],
    },
  ]
}

/** The Inspector's fields per Layer type, top to bottom. */
export type FieldTable = { [T in LayerType]: FieldGroup<LayerOf<T>>[] }

/** The Inspector's fields, with fonts picked from `manifest`. */
export function layerFields(manifest: FontManifest): FieldTable {
  return {
    rect: [...commonGroups<RectLayer>(), ...rectGroups()],
    image: [...commonGroups<ImageLayer>(), ...imageGroups()],
    text: [...commonGroups<TextLayer>(), ...textGroups(manifest), textFillGroup()],
  }
}

/** The Inspector's fields, with fonts from the app's font manifest. */
export const LAYER_FIELDS: FieldTable = layerFields(fontManifest)

/** Writes `value` into `field` of `layer`, rounded as the field rounds typed values. */
export function writeNumber(field: NumberFieldSpec, layer: Layer, value: number): Layer {
  return field.write(layer, field.round ? field.round(value) : value)
}
