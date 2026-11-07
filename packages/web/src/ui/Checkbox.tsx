// Checkbox: a labelled on/off switch (Inspector toggles such as Visible and Locked).
import type { ReactNode } from 'react'

type Props = {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function Checkbox({ label, checked, onChange, disabled, className }: Props) {
  return (
    <label className={className ? `checkbox ${className}` : 'checkbox'}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
