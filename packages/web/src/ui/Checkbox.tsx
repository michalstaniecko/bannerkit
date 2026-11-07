// Checkbox: a labelled on/off switch (Inspector toggles such as Visible and Locked).
// `mixed` shows it indeterminate (on for some selected Layers, off for others); a
// click then turns it on.
import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  mixed?: boolean
  disabled?: boolean
  className?: string
}

export function Checkbox({ label, checked, onChange, mixed = false, disabled, className }: Props) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (input.current) input.current.indeterminate = mixed
  }, [mixed])

  return (
    <label className={className ? `checkbox ${className}` : 'checkbox'}>
      <input
        ref={input}
        type="checkbox"
        checked={mixed ? false : checked}
        aria-checked={mixed ? 'mixed' : undefined}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
