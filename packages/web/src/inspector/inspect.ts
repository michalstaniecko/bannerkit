// What a field (fields.ts) shows and writes for the Layers in the Inspector: one Layer,
// or several at once. With several, only the fields every Layer type has are shown
// (`sharedFields`); a field whose values differ is Mixed, and a value set on it goes
// to every Layer. Box fields stand for the shared Box (the Selection Box; in M2 also a
// Group's Box): `x`/`y` move every Layer by the same delta, `width`/`height` are
// disabled. Every write is a recipe for `editor.update`: all Layers change in one
// step, or, when any result is not a valid Document, none does.
import {
  boxExtent,
  validateDocument,
  type Document,
  type Layer,
  type LayerType,
  type LinearGradient,
  type Rect,
  type TextLayer,
} from '@bannerkit/core'
import { roundPx } from '../editor/rounding.ts'
import {
  LAYER_FIELDS,
  writeNumber,
  type ColorFieldSpec,
  type FieldGroup,
  type FieldSpec,
  type GradientFieldSpec,
  type NumberFieldSpec,
  type SelectFieldSpec,
} from './fields.ts'
import type { GradientChange } from './gradient.ts'

/** A value that differs between the Layers in the Inspector. */
export const MIXED = Symbol('Mixed')
export type Mixed = typeof MIXED

/** The value every Layer shares, or MIXED. */
export type Shared<T> = T | Mixed

/** A change to the Document, run by `editor.update`. */
export type Recipe = (document: Document) => Document

/** The height of a text Layer's Box when it has none (its Text Layout height). */
export type TextHeight = (layer: TextLayer) => number

export type InspectOptions = {
  textHeight: TextHeight
  /** Box fields stand for the shared Box of `layers`. Default: when there are several. */
  sharedBox?: boolean
}

/** What one field shows, and the Document change for a value set on it. */
export type InspectedField =
  | { control: 'number'; field: NumberFieldSpec; value: Shared<number | undefined>; disabled: boolean; write: (value: number) => Recipe }
  | { control: 'toggle'; field: FieldSpec; value: Shared<boolean>; write: (value: boolean) => Recipe }
  | { control: 'readonly'; field: FieldSpec; value: Shared<string> }
  | { control: 'select'; field: SelectFieldSpec; value: Shared<string>; write: (value: string) => Recipe }
  | { control: 'color'; field: ColorFieldSpec; value: Shared<string | null | undefined>; write: (value: string | null) => Recipe }
  | {
      control: 'gradient'
      field: GradientFieldSpec
      angle: Shared<number>
      /** The stops, when every Layer's are the same (colours and offsets, in order). */
      stops: Shared<GradientStop[]>
      /** `change` applied to each Layer's own gradient. */
      write: (change: GradientChange) => Recipe
    }

type GradientStop = LinearGradient['stops'][number]

type FieldTable = { [T in LayerType]: FieldGroup<Extract<Layer, { type: T }>>[] }

/**
 * The field groups shown for `layers`: the groups and fields every Layer type in it
 * has, in the order of the first one, less a field whose `when` fails for any of the
 * Layers (e.g. shadow blur while some Layer has no shadow). A group left without
 * fields is dropped.
 */
export function sharedFields(layers: readonly Layer[], table: FieldTable = LAYER_FIELDS): FieldGroup[] {
  const types = [...new Set(layers.map((l) => l.type))]
  if (types.length === 0) return []
  const [first, ...rest] = types.map((type) => table[type] as FieldGroup[])
  return first!
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) =>
        rest.every((groups) => groups.find((g) => g.key === group.key)?.fields.some((f) => f.key === field.key)) &&
        layers.every((layer) => field.when?.(layer) ?? true),
      ),
    }))
    .filter((group) => group.fields.length > 0)
}

/** `read` of every Layer when they all agree, else MIXED. */
export function sharedValue<T>(layers: readonly Layer[], read: (layer: Layer) => T): Shared<T> {
  const values = layers.map(read)
  return values.every((v) => v === values[0]) ? values[0]! : MIXED
}

/** The axis-aligned union of the `boxExtent`s of `layers`: their Selection Box. */
export function sharedBox(layers: readonly Layer[], textHeight: TextHeight): Rect {
  const extents = layers.map((l) =>
    boxExtent({ ...l, height: 'height' in l && l.height !== undefined ? l.height : textHeight(l as TextLayer) }),
  )
  const x = Math.min(...extents.map((e) => e.x))
  const y = Math.min(...extents.map((e) => e.y))
  const right = Math.max(...extents.map((e) => e.x + e.width))
  const bottom = Math.max(...extents.map((e) => e.y + e.height))
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * `document` with every Layer in `ids` rewritten by `write`. When the result is not a
 * valid Document (a value outside the schema, a broken cross-field rule) `document`
 * itself comes back, so the edit changes nothing.
 */
export function editLayers(document: Document, ids: readonly string[], write: (layer: Layer) => Layer): Document {
  const next = { ...document, layers: document.layers.map((l) => (ids.includes(l.id) ? write(l) : l)) }
  return validateDocument(next).ok ? next : document
}

/** `document` with every Layer in `ids` moved by `dx`, `dy`. */
export function moveLayers(document: Document, ids: readonly string[], dx: number, dy: number): Document {
  if (dx === 0 && dy === 0) return document
  return editLayers(document, ids, (l) => ({ ...l, x: l.x + dx, y: l.y + dy }))
}

/** What `field` shows for `layers` and how a value set on it changes the Document. */
export function inspectField(field: FieldSpec, layers: readonly Layer[], options: InspectOptions): InspectedField {
  const ids = layers.map((l) => l.id)
  const shared = options.sharedBox ?? layers.length > 1
  const each = (write: (layer: Layer) => Layer): Recipe => (document) => editLayers(document, ids, write)

  switch (field.control) {
    case 'readonly':
      return { control: 'readonly', field, value: sharedValue(layers, field.read) }
    case 'toggle':
      return { control: 'toggle', field, value: sharedValue(layers, field.read), write: (value) => each((l) => field.write(l, value)) }
    case 'select':
      return { control: 'select', field, value: sharedValue(layers, field.read), write: (value) => each((l) => field.write(l, value)) }
    case 'color': {
      // `undefined` is a value the field cannot show (a gradient fill). One Layer shows
      // the field's placeholder for it; with several it is Mixed.
      const value = sharedValue(layers, field.read)
      return {
        control: 'color',
        field,
        value: value === undefined && layers.length > 1 ? MIXED : value,
        write: (value) => each((l) => field.write(l, value)),
      }
    }
    case 'gradient': {
      const stops = sharedValue(layers, (l) => JSON.stringify(field.read(l)?.stops))
      return {
        control: 'gradient',
        field,
        angle: sharedValue(layers, (l) => field.read(l)?.angle ?? 0),
        stops: stops === MIXED ? MIXED : (JSON.parse(stops) as GradientStop[]),
        write: (change) =>
          each((l) => {
            const gradient = field.read(l)
            return gradient ? field.write(l, change(gradient)) : l
          }),
      }
    }
    case 'number': {
      if (shared && field.box) {
        const side = field.box
        const box = sharedBox(layers, options.textHeight)
        if (side === 'width' || side === 'height') return { control: 'number', field, value: roundPx(box[side]), disabled: true, write: () => (d) => d }
        // The Box's side shows on whole px; the typed value moves every Layer by one whole-px delta.
        const write = (value: number): Recipe => (document) => {
          const now = sharedBox(document.layers.filter((l) => ids.includes(l.id)), options.textHeight)
          const delta = roundPx(value - now[side])
          return side === 'x' ? moveLayers(document, ids, delta, 0) : moveLayers(document, ids, 0, delta)
        }
        return { control: 'number', field, value: roundPx(box[side]), disabled: false, write }
      }
      return {
        control: 'number',
        field,
        value: sharedValue(layers, field.read),
        disabled: false,
        write: (value) => each((l) => writeNumber(field, l, value)),
      }
    }
  }
}
