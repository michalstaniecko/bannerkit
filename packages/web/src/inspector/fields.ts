// The Inspector's fields, described as data: for each Layer type, titled groups of
// fields, each with its control, range and how it reads and writes the Layer. The
// Properties tab only renders these, so a new field (a later ticket, M2's Group,
// `textTransform`, `fontStyle`) is a new entry here, not a change to the Inspector.
//
// Ranges come from the Document schema. A write returns the next Layer; an optional
// field written with its default value leaves the key out of the Document.
import {
  RectLayerSchema,
  validateDocument,
  type Document,
  type ImageLayer,
  type Layer,
  type LayerType,
  type RectLayer,
  type TextLayer,
} from '@bannerkit/core'
import { roundAngle, roundPx } from '../editor/rounding.ts'

type FieldBase = {
  /** Stable id of the field, unique within its Layer type (and shared across types for the same field). */
  key: string
  /** Shown beside the control. */
  label: string
  /** Accessible name of the control; defaults to `label`. */
  name?: string
}

/** A number typed (or stepped with the arrow keys) in a NumberField. */
export type NumberFieldSpec<L extends Layer = Layer> = FieldBase & {
  control: 'number'
  min?: number
  max?: number
  /** Arrow keys step by this (Shift: ×10). Default 1. */
  step?: number
  /** Applied to a typed value before it is written (e.g. whole px). */
  round?: (value: number) => number
  /** Shown in place of a missing value. */
  placeholder?: string
  read: (layer: L) => number | undefined
  write: (layer: L, value: number) => L
}

/** An on/off switch. */
export type ToggleFieldSpec<L extends Layer = Layer> = FieldBase & {
  control: 'toggle'
  read: (layer: L) => boolean
  write: (layer: L, value: boolean) => L
}

/** A value shown but never edited (the Layer id). */
export type ReadOnlyFieldSpec<L extends Layer = Layer> = FieldBase & {
  control: 'readonly'
  read: (layer: L) => string
}

export type FieldSpec<L extends Layer = Layer> = NumberFieldSpec<L> | ToggleFieldSpec<L> | ReadOnlyFieldSpec<L>

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
        { control: 'number', key: 'x', label: 'X', round: roundPx, read: (l) => l.x, write: (l, x) => ({ ...l, x }) },
        { control: 'number', key: 'y', label: 'Y', round: roundPx, read: (l) => l.y, write: (l, y) => ({ ...l, y }) },
        {
          control: 'number',
          key: 'width',
          label: 'W',
          name: 'Width',
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
  ]
}

/** The Inspector's fields per Layer type, top to bottom. */
export const LAYER_FIELDS: { [T in LayerType]: FieldGroup<LayerOf<T>>[] } = {
  rect: commonGroups<RectLayer>(),
  image: commonGroups<ImageLayer>(),
  text: commonGroups<TextLayer>(),
}

/** The field groups the Inspector shows for `layer`. */
export function fieldsFor(layer: Layer): FieldGroup[] {
  return LAYER_FIELDS[layer.type] as FieldGroup[]
}

/**
 * `document` with Layer `id` rewritten by `write`. When the result is not a valid
 * Document (a value outside the schema, a broken cross-field rule) `document` itself
 * comes back, so the edit changes nothing.
 */
export function editLayer(document: Document, id: string, write: (layer: Layer) => Layer): Document {
  const next = { ...document, layers: document.layers.map((l) => (l.id === id ? write(l) : l)) }
  return validateDocument(next).ok ? next : document
}

/** Writes `value` into `field` of `layer`, rounded as the field rounds typed values. */
export function writeNumber(field: NumberFieldSpec, layer: Layer, value: number): Layer {
  return field.write(layer, field.round ? field.round(value) : value)
}
