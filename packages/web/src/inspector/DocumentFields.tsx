// The Inspector for an empty Selection: the Document's name, its Canvas size with an
// Anchor and its background. A new width or height goes through core `resizeCanvas`
// from the chosen Anchor (Layers move, never scale) as one step with cause `resize`;
// dragging the Width/Height label previews the resize and commits once on release.
// The Anchor is UI state of the session (held by whoever renders this) and never
// reaches the Document.
import { MAX_CANVAS_SIDE, resizeCanvas, type Anchor, type Document, type Size } from '@bannerkit/core'
import { ColorField } from '../ui/ColorField.tsx'
import { NumberField } from '../ui/NumberField.tsx'
import { Section } from '../ui/Panel.tsx'
import { TextField } from '../ui/TextField.tsx'
import { AnchorPicker } from './AnchorPicker.tsx'
import type { Edits } from './useEdits.ts'

type Props = {
  document: Document
  anchor: Anchor
  onAnchorChange: (anchor: Anchor) => void
  edits: Edits
  /** A new value drops a value being typed (a reload from disk). */
  resetKey: unknown
}

export function DocumentFields({ document, anchor, onAnchorChange, edits, resetKey }: Props) {
  const resize = (axis: keyof Size, value: number) => (d: Document) =>
    resizeCanvas(d, { width: d.canvas.width, height: d.canvas.height, [axis]: Math.round(value) }, anchor)
  const sizeField = (axis: keyof Size, label: string) => (
    <NumberField
      label={label}
      value={document.canvas[axis]}
      min={1}
      max={MAX_CANVAS_SIDE}
      resetKey={resetKey}
      onCommit={(value) => edits.commit(resize(axis, value), 'resize')}
      onPreview={(value) => edits.preview(resize(axis, value))}
      onCancel={edits.cancel}
    />
  )

  return (
    <>
      <Section title="Document">
        <div className="field-grid">
          <TextField
            label="Name"
            value={document.name}
            resetKey={resetKey}
            onCommit={(name) => edits.commit((d) => ({ ...d, name }))}
          />
        </div>
      </Section>
      <Section title="Canvas">
        <div className="field-grid">
          {sizeField('width', 'Width')}
          {sizeField('height', 'Height')}
          <AnchorPicker value={anchor} onChange={onAnchorChange} />
          <ColorField
            label="Background"
            value={document.canvas.background}
            nullable
            resetKey={resetKey}
            onCommit={(background) => edits.commit((d) => ({ ...d, canvas: { ...d.canvas, background } }))}
          />
        </div>
      </Section>
    </>
  )
}
