// The gradient editor: a linear gradient's angle and its stops, each with a colour
// and an offset (0–1), in Document order. Stops can be added and removed, never below
// two. Every edit is a GradientChange (gradient.ts) that the Inspector commits as one
// step; dragging the Angle or an offset label previews it first. With several Layers
// the angle may be Mixed, and stops that differ show only as "Mixed" (switching the
// fill type to Color and back gives them all the same stops again).
import type { LinearGradient } from '@bannerkit/core'
import { Plus, X } from 'lucide-react'
import { roundAngle } from '../editor/rounding.ts'
import { Button } from '../ui/Button.tsx'
import { ColorField } from '../ui/ColorField.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { NumberField } from '../ui/NumberField.tsx'
import { addStop, MIN_STOPS, removeStop, setAngle, setStopColor, setStopOffset, type GradientChange } from './gradient.ts'
import { MIXED, type Shared } from './inspect.ts'

type Props = {
  angle: Shared<number>
  stops: Shared<LinearGradient['stops']>
  /** Shown for a value that differs between the Layers. */
  mixedLabel: string
  resetKey: unknown
  onWrite: (change: GradientChange) => void
  onPreview: (change: GradientChange) => void
  onCancel: () => void
}

export function GradientField({ angle, stops, mixedLabel, resetKey, onWrite, onPreview, onCancel }: Props) {
  return (
    <div className="gradient-field">
      <NumberField
        label="Angle"
        value={angle === MIXED ? undefined : angle}
        placeholder={angle === MIXED ? mixedLabel : undefined}
        resetKey={resetKey}
        onCommit={(value) => onWrite(setAngle(roundAngle(value)))}
        onPreview={(value) => onPreview(setAngle(roundAngle(value)))}
        onCancel={onCancel}
      />
      {stops === MIXED ? (
        <p className="gradient-field-mixed">Stops: {mixedLabel}</p>
      ) : (
        <>
          <ol className="gradient-stops" aria-label="Stops">
            {stops.map(([color, offset], i) => {
              const n = i + 1
              return (
                <li key={i} className="gradient-stop">
                  <ColorField
                    label={`Stop ${n}`}
                    name={`Stop ${n} color`}
                    value={color}
                    resetKey={resetKey}
                    onCommit={(value) => value !== null && onWrite(setStopColor(i, value))}
                  />
                  <NumberField
                    label="At"
                    name={`Stop ${n} offset`}
                    value={offset}
                    min={0}
                    max={1}
                    step={0.01}
                    resetKey={resetKey}
                    onCommit={(value) => onWrite(setStopOffset(i, value))}
                    onPreview={(value) => onPreview(setStopOffset(i, value))}
                    onCancel={onCancel}
                  />
                  <IconButton
                    icon={X}
                    label={`Remove stop ${n}`}
                    disabled={stops.length <= MIN_STOPS}
                    onClick={() => onWrite(removeStop(i))}
                  />
                </li>
              )
            })}
          </ol>
          <Button icon={Plus} onClick={() => onWrite(addStop())}>
            Add stop
          </Button>
        </>
      )}
    </div>
  )
}
