// What a field (fields.ts) shows and writes for the Layers in the Inspector: one Layer,
// or several at once. With several, only the fields every Layer type has are shown
// (`sharedFields`); a field whose values differ is Mixed, and a value set on it goes
// to every Layer. Box fields stand for the shared Box (the Selection Box; in M2 also a
// Group's Box): `x`/`y` move every Layer by the same delta, `width`/`height` are
// disabled. Every write is a recipe for `editor.update`: all Layers change in one
// step, or, when any result is not a valid Document, none does.
import {
  mapLayers,
  selectionBox,
  translateLayer,
  validateDocument,
  walkLayers,
  type Document,
  type Layer,
  type LinearGradient,
  type MeasureText,
} from '@bannerkit/core'
import type { DocumentRecipe } from '../editor/index.ts'
import { roundPx } from '../editor/rounding.ts'
import type { SelectOption } from '../ui/Select.tsx'
import {
  LAYER_FIELDS,
  writeNumber,
  type ColorFieldSpec,
  type FieldContext,
  type FieldGroup,
  type FieldTable,
  type FieldSpec,
  type GradientFieldSpec,
  type NumberFieldSpec,
  type SegmentedFieldSpec,
  type SelectFieldSpec,
  type TextFieldSpec,
} from './fields.ts'
import type { GradientChange } from './gradient.ts'

/** A value that differs between the Layers in the Inspector. */
export const MIXED = Symbol('Mixed')
export type Mixed = typeof MIXED

/** The value every Layer shares, or MIXED. */
export type Shared<T> = T | Mixed

export type InspectOptions = FieldContext & {
  /** The measure the Canvas lays text out with, for the Selection Box (core `selectionBox`). */
  measure: MeasureText
  /** Box fields stand for the shared Box of `layers`. Default: when there are several, or a Group (its Box). */
  sharedBox?: boolean
}

/** What one field shows, and the Document change for a value set on it. */
export type InspectedField =
  | { control: 'number'; field: NumberFieldSpec; value: Shared<number | undefined>; disabled: boolean; write: (value: number) => DocumentRecipe }
  | { control: 'toggle'; field: FieldSpec; value: Shared<boolean>; disabled: boolean; write: (value: boolean) => DocumentRecipe }
  | { control: 'readonly'; field: FieldSpec; value: Shared<string> }
  | { control: 'text'; field: TextFieldSpec; value: Shared<string>; write: (value: string) => DocumentRecipe }
  | {
      control: 'select'
      field: SelectFieldSpec
      /** The options every one of the Layers can take. */
      options: readonly SelectOption[]
      value: Shared<string>
      write: (value: string) => DocumentRecipe
    }
  | { control: 'segmented'; field: SegmentedFieldSpec; value: Shared<string>; write: (value: string) => DocumentRecipe }
  | { control: 'color'; field: ColorFieldSpec; value: Shared<string | null | undefined>; write: (value: string | null) => DocumentRecipe }
  | {
      control: 'gradient'
      field: GradientFieldSpec
      angle: Shared<number>
      /** The stops, when every Layer's are the same (colours and offsets, in order). */
      stops: Shared<GradientStop[]>
      /** `change` applied to each Layer's own gradient. */
      write: (change: GradientChange) => DocumentRecipe
    }

type GradientStop = LinearGradient['stops'][number]

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

/**
 * `document` with every Layer in `ids` rewritten by `write`. When the result is not a
 * valid Document (a value outside the schema, a broken cross-field rule) `document`
 * itself comes back, so the edit changes nothing.
 */
export function editLayers(document: Document, ids: readonly string[], write: (layer: Layer) => Layer): Document {
  const next = mapLayers(document, (l) => (ids.includes(l.id) ? write(l) : l))
  return validateDocument(next).ok ? next : document
}

/** The Layers `ids` of `document`, in draw order. */
export function selectedLayers(document: Document, ids: readonly string[]): Layer[] {
  return walkLayers(document)
    .map((v) => v.layer)
    .filter((l) => ids.includes(l.id))
}

/** `document` with every Layer in `ids` moved by `dx`, `dy` (a Group by moving everything in it). */
export function moveLayers(document: Document, ids: readonly string[], dx: number, dy: number): Document {
  if (dx === 0 && dy === 0) return document
  return editLayers(document, ids, (l) => translateLayer(l, dx, dy))
}

/** The options of `field` every one of `layers` can take, in the first Layer's order. */
function sharedOptions(field: SelectFieldSpec, layers: readonly Layer[]): readonly SelectOption[] {
  const { options } = field
  if (typeof options !== 'function') return options
  const [first, ...rest] = layers.map(options)
  return (first ?? []).filter((o) => rest.every((more) => more.some((m) => m.value === o.value)))
}

/** What `field` shows for `layers` and how a value set on it changes the Document. */
export function inspectField(field: FieldSpec, layers: readonly Layer[], options: InspectOptions): InspectedField {
  const ids = layers.map((l) => l.id)
  const shared = options.sharedBox ?? (layers.length > 1 || layers.some((l) => l.type === 'group'))
  const each = (write: (layer: Layer) => Layer): DocumentRecipe => (document) => editLayers(document, ids, write)
  const context: FieldContext = { textLayout: options.textLayout }

  switch (field.control) {
    case 'readonly':
      return { control: 'readonly', field, value: sharedValue(layers, (l) => field.read(l, context)) }
    case 'text':
      return {
        control: 'text',
        field,
        value: sharedValue(layers, (l) => field.read(l, context)),
        write: (value) => each((l) => field.write(l, value, context)),
      }
    case 'toggle':
      return {
        control: 'toggle',
        field,
        value: sharedValue(layers, (l) => field.read(l, context)),
        disabled: layers.some((l) => field.disabled?.(l) ?? false),
        write: (value) => each((l) => field.write(l, value, context)),
      }
    case 'select':
      return {
        control: 'select',
        field,
        options: sharedOptions(field, layers),
        value: sharedValue(layers, (l) => field.read(l, context)),
        write: (value) => each((l) => field.write(l, value, context)),
      }
    case 'segmented':
      return {
        control: 'segmented',
        field,
        value: sharedValue(layers, (l) => field.read(l, context)),
        write: (value) => each((l) => field.write(l, value, context)),
      }
    case 'color': {
      // `undefined` is a value the field cannot show (a gradient fill). One Layer shows
      // the field's placeholder for it; with several it is Mixed.
      const value = sharedValue(layers, (l) => field.read(l, context))
      return {
        control: 'color',
        field,
        value: value === undefined && layers.length > 1 ? MIXED : value,
        write: (value) => each((l) => field.write(l, value, context)),
      }
    }
    case 'gradient': {
      const stops = sharedValue(layers, (l) => JSON.stringify(field.read(l, context)?.stops))
      return {
        control: 'gradient',
        field,
        angle: sharedValue(layers, (l) => field.read(l, context)?.angle ?? 0),
        stops: stops === MIXED ? MIXED : (JSON.parse(stops) as GradientStop[]),
        write: (change) =>
          each((l) => {
            const gradient = field.read(l, context)
            return gradient ? field.write(l, change(gradient), context) : l
          }),
      }
    }
    case 'number': {
      if (shared && field.box) {
        const side = field.box
        const box = selectionBox(layers, options.measure)!
        if (side === 'width' || side === 'height') return { control: 'number', field, value: roundPx(box[side]), disabled: true, write: () => (d) => d }
        // The Box's side shows on whole px; the typed value moves every Layer by one whole-px delta.
        const write = (value: number): DocumentRecipe => (document) => {
          const now = selectionBox(selectedLayers(document, ids), options.measure)!
          const delta = roundPx(value - now[side])
          return side === 'x' ? moveLayers(document, ids, delta, 0) : moveLayers(document, ids, 0, delta)
        }
        return { control: 'number', field, value: roundPx(box[side]), disabled: false, write }
      }
      return {
        control: 'number',
        field,
        value: sharedValue(layers, (l) => field.read(l, context)),
        disabled: false,
        write: (value) => each((l) => writeNumber(field, l, value, context)),
      }
    }
  }
}
