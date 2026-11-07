// The Inspector's "Properties" tab: the fields (fields.ts) of the selected Layer.
// Every committed field is one `editor.update` with cause `inspector`: one undo step,
// one `change`, the Selection kept. A reload from disk drops a value being typed and
// shows the reloaded one. The Document (empty Selection) and several Layers come with
// later tickets.
import type { Layer } from '@bannerkit/core'
import type { RefObject } from 'react'
import type { Editor } from '../editor/index.ts'
import { Checkbox } from '../ui/Checkbox.tsx'
import { ColorField } from '../ui/ColorField.tsx'
import { NumberField } from '../ui/NumberField.tsx'
import { Section } from '../ui/Panel.tsx'
import { Select } from '../ui/Select.tsx'
import { editLayer, fieldsFor, writeNumber, type FieldSpec } from './fields.ts'
import { useInspected } from './useInspected.ts'

type Props = {
  editor: RefObject<Editor | null>
  loaded: boolean
}

export function Properties({ editor, loaded }: Props) {
  const { document, selection, reloads } = useInspected(editor, loaded)
  const layer = document && selection.length === 1 ? document.layers.find((l) => l.id === selection[0]) : undefined

  const write = (id: string, change: (layer: Layer) => Layer) =>
    void editor.current?.update((d) => editLayer(d, id, change), { cause: 'inspector' })

  return (
    <div className="inspector-properties">
      {layer &&
        fieldsFor(layer).map((group) => (
          <Section key={group.key} title={group.title}>
            <div className="field-grid">
              {group.fields.filter((field) => field.when?.(layer) ?? true).map((field) => (
                <Field key={field.key} field={field} layer={layer} resetKey={reloads} onWrite={(change) => write(layer.id, change)} />
              ))}
            </div>
          </Section>
        ))}
    </div>
  )
}

type FieldProps = {
  field: FieldSpec
  layer: Layer
  resetKey: unknown
  onWrite: (change: (layer: Layer) => Layer) => void
}

function Field({ field, layer, resetKey, onWrite }: FieldProps) {
  switch (field.control) {
    case 'number':
      return (
        <NumberField
          label={field.label}
          name={field.name}
          value={field.read(layer)}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          resetKey={resetKey}
          onCommit={(value) => onWrite((l) => writeNumber(field, l, value))}
        />
      )
    case 'toggle':
      return <Checkbox label={field.label} checked={field.read(layer)} onChange={(value) => onWrite((l) => field.write(l, value))} />
    case 'color':
      return (
        <ColorField
          label={field.label}
          name={field.name}
          value={field.read(layer)}
          nullable={field.nullable}
          placeholder={field.placeholder}
          resetKey={resetKey}
          onCommit={(value) => onWrite((l) => field.write(l, value))}
        />
      )
    case 'select':
      return (
        <Select
          label={field.label}
          name={field.name}
          value={field.read(layer)}
          options={field.options}
          onChange={(value) => onWrite((l) => field.write(l, value))}
        />
      )
    case 'readonly':
      return <ReadOnly label={field.label} value={field.read(layer)} />
  }
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="readonly-field">
      <span className="readonly-field-label">{label}</span>
      <output className="readonly-field-value" aria-label={label}>
        {value}
      </output>
    </div>
  )
}
