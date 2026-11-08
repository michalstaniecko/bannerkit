// TextField: a labelled single-line text input that commits, never streams, like
// NumberField: typing edits a draft that Enter or leaving the field commits and Escape
// drops. A draft that `valid` refuses (default: blank) is dropped, so the field shows
// the value again. Changing `resetKey` drops a draft in progress.
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'

export type TextFieldProps = {
  /** Shown beside the input. */
  label: ReactNode
  /** Accessible name of the input when `label` is not a string. */
  name?: string
  value: string
  /** A new, valid value the user committed. */
  onCommit: (value: string) => void
  /** Whether a committed draft may become the value. Default: not blank. */
  valid?: (value: string) => boolean
  /** Shown while the input is empty. */
  placeholder?: string
  disabled?: boolean
  /** A new value drops the uncommitted draft. */
  resetKey?: unknown
  className?: string
}

const notBlank = (value: string) => value.trim() !== ''

export function TextField({ label, name, value, onCommit, valid = notBlank, placeholder, disabled, resetKey, className }: TextFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => setDraft(null), [resetKey])

  const commit = () => {
    if (draft === null) return
    setDraft(null)
    if (draft !== value && valid(draft)) onCommit(draft)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(null)
    }
  }

  return (
    <div className={className ? `text-field ${className}` : 'text-field'}>
      <label className="text-field-label" htmlFor={id} title={name}>
        {label}
      </label>
      <input
        id={id}
        className="text-field-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        aria-label={name}
        value={draft ?? value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  )
}
