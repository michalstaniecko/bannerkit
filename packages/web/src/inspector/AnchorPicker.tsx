// The Anchor 3×3: which point of the Canvas stays put when its size changes. Nine
// radio buttons, row by row from the top-left, named after the Anchor (`top-left`, ...).
import { ANCHORS, type Anchor } from '@bannerkit/core'
import { useId } from 'react'

type Props = {
  value: Anchor
  onChange: (anchor: Anchor) => void
  disabled?: boolean
}

export function AnchorPicker({ value, onChange, disabled }: Props) {
  const name = useId()
  return (
    <fieldset className="anchor-picker" disabled={disabled}>
      <legend className="anchor-picker-label">Anchor</legend>
      <div className="anchor-picker-grid">
        {ANCHORS.map((anchor) => (
          <input
            key={anchor}
            className="anchor-picker-point"
            type="radio"
            name={name}
            aria-label={anchor}
            title={anchor}
            checked={anchor === value}
            onChange={() => onChange(anchor)}
          />
        ))}
      </div>
    </fieldset>
  )
}
