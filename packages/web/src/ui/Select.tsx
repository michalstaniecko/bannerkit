// Select: a labelled native <select> of fixed options (image fit, text align, font
// weight). Picking an option commits it at once. `value` undefined shows an empty,
// unpickable entry with `placeholder` (e.g. "Mixed" for several Layers).
import { useId, type ReactNode } from 'react'

export type SelectOption<V extends string = string> = { value: V; label: string }

export type SelectProps<V extends string = string> = {
  /** Shown beside the select. */
  label: ReactNode
  /** Accessible name when `label` is not enough. */
  name?: string
  /** The current value; `undefined` shows `placeholder`. */
  value: V | undefined
  options: readonly SelectOption<V>[]
  /** An option the user picked (never the current value). */
  onChange: (value: V) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function Select<V extends string = string>({
  label,
  name,
  value,
  options,
  onChange,
  placeholder = '',
  disabled,
  className,
}: SelectProps<V>) {
  const id = useId()
  return (
    <div className={className ? `select-field ${className}` : 'select-field'}>
      <label className="select-field-label" htmlFor={id} title={name}>
        {label}
      </label>
      <select
        id={id}
        className="select-field-input"
        aria-label={name}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value)
          if (next && next.value !== value) onChange(next.value)
        }}
      >
        {value === undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
