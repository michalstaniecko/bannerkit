// Segmented: a labelled row of a few mutually exclusive options (text transform),
// one button each, as an ARIA radiogroup. Picking an option commits it at once.
// `value` undefined checks none and shows `placeholder` (e.g. "Mixed" for several
// Layers); any option can then be picked.
import { useId, type ReactNode } from 'react'

export type SegmentedOption<V extends string = string> = {
  value: V
  /** Shown on the button. */
  label: ReactNode
  /** Accessible name of the button. */
  name: string
}

export type SegmentedProps<V extends string = string> = {
  /** Shown beside the options. */
  label: ReactNode
  /** Accessible name of the group when `label` is not enough. */
  name?: string
  value: V | undefined
  options: readonly SegmentedOption<V>[]
  /** An option the user picked (never the current value). */
  onChange: (value: V) => void
  placeholder?: string
  disabled?: boolean
}

export function Segmented<V extends string = string>({
  label,
  name,
  value,
  options,
  onChange,
  placeholder = '',
  disabled,
}: SegmentedProps<V>) {
  const id = useId()
  return (
    <div className="segmented-field">
      <span className="segmented-field-label" id={id} title={name}>
        {label}
      </span>
      <div className="segmented-field-options" role="radiogroup" aria-labelledby={name ? undefined : id} aria-label={name}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            className="segmented-field-option"
            aria-label={o.name}
            title={o.name}
            aria-checked={o.value === value}
            disabled={disabled}
            onClick={() => {
              if (o.value !== value) onChange(o.value)
            }}
          >
            {o.label}
          </button>
        ))}
        {value === undefined && placeholder && <span className="segmented-field-placeholder">{placeholder}</span>}
      </div>
    </div>
  )
}
