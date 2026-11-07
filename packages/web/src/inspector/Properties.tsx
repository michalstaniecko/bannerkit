// The Inspector's "Properties" tab: the fields (fields.ts) of the selected Layers, as
// inspect.ts resolves them for one Layer or several (Mixed values, the Selection Box).
// Every committed field is one `editor.update` with cause `inspector`: one undo step,
// one `change`, the Selection kept. A reload from disk drops a value being typed and
// shows the reloaded one. Dragging a number field's label previews each value on the
// Canvas (useEdits) and commits one step on release; with several Layers, dragging X/Y
// moves the Selection Box. The Document (empty Selection) comes with a later ticket.
import { layoutText } from '@bannerkit/core'
import type { RefObject } from 'react'
import { measureText } from '../editor/fonts.ts'
import type { Editor } from '../editor/index.ts'
import { Checkbox } from '../ui/Checkbox.tsx'
import { ColorField } from '../ui/ColorField.tsx'
import { NumberField } from '../ui/NumberField.tsx'
import { Section } from '../ui/Panel.tsx'
import { Select } from '../ui/Select.tsx'
import { inspectField, MIXED, sharedFields, type InspectedField, type Recipe, type TextHeight } from './inspect.ts'
import { useEdits } from './useEdits.ts'
import { useInspected } from './useInspected.ts'

type Props = {
  editor: RefObject<Editor | null>
  loaded: boolean
}

/** Shown for a value that differs between the selected Layers. */
const MIXED_LABEL = 'Mixed'

const textHeight: TextHeight = (layer) => layoutText(layer, measureText).height

export function Properties({ editor, loaded }: Props) {
  const { document, selection, reloads } = useInspected(editor, loaded)
  const layers = document ? document.layers.filter((l) => selection.includes(l.id)) : []
  const edits = useEdits(editor)

  return (
    <div className="inspector-properties">
      {sharedFields(layers).map((group) => (
        <Section key={group.key} title={group.title}>
          <div className="field-grid">
            {group.fields.map((field) => (
              <Field
                key={field.key}
                inspected={inspectField(field, layers, { textHeight })}
                resetKey={reloads}
                onWrite={edits.commit}
                onPreview={edits.preview}
                onCancel={edits.cancel}
              />
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

type FieldProps = {
  inspected: InspectedField
  resetKey: unknown
  onWrite: (recipe: Recipe) => void
  onPreview: (recipe: Recipe) => void
  onCancel: () => void
}

function Field({ inspected, resetKey, onWrite, onPreview, onCancel }: FieldProps) {
  const { field } = inspected
  switch (inspected.control) {
    case 'number': {
      const { field, value } = inspected
      return (
        <NumberField
          label={field.label}
          name={field.name}
          value={value === MIXED ? undefined : value}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={value === MIXED ? MIXED_LABEL : field.placeholder}
          disabled={inspected.disabled}
          resetKey={resetKey}
          onCommit={(value) => onWrite(inspected.write(value))}
          onPreview={(value) => onPreview(inspected.write(value))}
          onCancel={onCancel}
        />
      )
    }
    case 'toggle':
      return (
        <Checkbox
          label={field.label}
          checked={inspected.value === true}
          mixed={inspected.value === MIXED}
          onChange={(value) => onWrite(inspected.write(value))}
        />
      )
    case 'color': {
      const { field, value } = inspected
      return (
        <ColorField
          label={field.label}
          name={field.name}
          value={value === MIXED ? undefined : value}
          nullable={field.nullable}
          placeholder={value === MIXED ? MIXED_LABEL : field.placeholder}
          resetKey={resetKey}
          onCommit={(value) => onWrite(inspected.write(value))}
        />
      )
    }
    case 'select': {
      const { field, value } = inspected
      return (
        <Select
          label={field.label}
          name={field.name}
          value={value === MIXED ? undefined : value}
          options={inspected.options}
          placeholder={MIXED_LABEL}
          onChange={(value) => onWrite(inspected.write(value))}
        />
      )
    }
    case 'readonly':
      return <ReadOnly label={field.label} value={inspected.value === MIXED ? MIXED_LABEL : inspected.value} />
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
