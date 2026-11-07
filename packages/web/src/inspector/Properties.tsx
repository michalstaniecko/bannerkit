// The Inspector's "Properties" tab: the fields (fields.ts) of the selected Layers, as
// inspect.ts resolves them for one Layer or several (Mixed values, the Selection Box).
// Every committed field is one `editor.update` with cause `inspector`: one undo step,
// one `change`, the Selection kept. A reload from disk drops a value being typed and
// shows the reloaded one. Dragging a number field's label previews each value on the
// Canvas (useEdits) and commits one step on release; with several Layers, dragging X/Y
// moves the Selection Box. With an empty Selection it shows the Document
// (DocumentFields); the Anchor it resizes from is held by the caller for the session.
import type { Anchor, TextLayer, TextLayout } from '@bannerkit/core'
import type { RefObject } from 'react'
import type { DocumentRecipe, Editor } from '../editor/index.ts'
import { Checkbox } from '../ui/Checkbox.tsx'
import { ColorField } from '../ui/ColorField.tsx'
import { NumberField } from '../ui/NumberField.tsx'
import { Section } from '../ui/Panel.tsx'
import { Segmented } from '../ui/Segmented.tsx'
import { Select } from '../ui/Select.tsx'
import { TextField } from '../ui/TextField.tsx'
import { DocumentFields } from './DocumentFields.tsx'
import { GradientField } from './GradientField.tsx'
import { inspectField, MIXED, selectedLayers, sharedFields, type InspectedField } from './inspect.ts'
import { useEdits } from './useEdits.ts'
import { useInspected } from './useInspected.ts'

type Props = {
  editor: RefObject<Editor | null>
  loaded: boolean
  /** The Anchor a new Canvas size keeps put: UI state, never in the Document. */
  anchor: Anchor
  onAnchorChange: (anchor: Anchor) => void
}

/** Shown for a value that differs between the selected Layers. */
const MIXED_LABEL = 'Mixed'

export function Properties({ editor, loaded, anchor, onAnchorChange }: Props) {
  const { document, selection, reloads } = useInspected(editor, loaded)
  const layers = document ? selectedLayers(document, selection) : []
  const edits = useEdits(editor)
  // Text Layout (used font size, Auto height) as the editor lays it out: core
  // `layoutText` with the Canvas's measure, never read back from Fabric.
  const textLayout = (layer: TextLayer): TextLayout => {
    if (!editor.current) throw new Error('No editor')
    return editor.current.textLayout(layer)
  }

  if (document && layers.length === 0) {
    return (
      <div className="inspector-properties">
        <DocumentFields document={document} anchor={anchor} onAnchorChange={onAnchorChange} edits={edits} resetKey={reloads} />
      </div>
    )
  }

  return (
    <div className="inspector-properties">
      {sharedFields(layers).map((group) => (
        <Section key={group.key} title={group.title}>
          <div className="field-grid">
            {group.fields.map((field) => (
              <Field
                key={field.key}
                inspected={inspectField(field, layers, { textLayout })}
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
  onWrite: (recipe: DocumentRecipe) => void
  onPreview: (recipe: DocumentRecipe) => void
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
          disabled={inspected.disabled}
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
    case 'segmented': {
      const { field, value } = inspected
      return (
        <Segmented
          label={field.label}
          name={field.name}
          value={value === MIXED ? undefined : value}
          options={field.options}
          placeholder={MIXED_LABEL}
          onChange={(value) => onWrite(inspected.write(value))}
        />
      )
    }
    case 'gradient':
      return (
        <GradientField
          angle={inspected.angle}
          stops={inspected.stops}
          mixedLabel={MIXED_LABEL}
          resetKey={resetKey}
          onWrite={(change) => onWrite(inspected.write(change))}
          onPreview={(change) => onPreview(inspected.write(change))}
          onCancel={onCancel}
        />
      )
    case 'text': {
      const { field, value } = inspected
      return (
        <TextField
          label={field.label}
          name={field.name ?? field.label}
          value={value === MIXED ? '' : value}
          placeholder={value === MIXED ? MIXED_LABEL : undefined}
          valid={() => true}
          resetKey={resetKey}
          onCommit={(value) => onWrite(inspected.write(value))}
        />
      )
    }
    case 'readonly':
      return <ReadOnly label={field.label} name={field.name} value={inspected.value === MIXED ? MIXED_LABEL : inspected.value} />
    default:
      // Every control is handled above: a new one fails to compile here.
      return inspected satisfies never
  }
}

function ReadOnly({ label, name = label, value }: { label: string; name?: string; value: string }) {
  return (
    <div className="readonly-field">
      <span className="readonly-field-label">{label}</span>
      <output className="readonly-field-value" aria-label={name}>
        {value}
      </output>
    </div>
  )
}
