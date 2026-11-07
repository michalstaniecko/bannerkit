// NumberField: a labelled number input that commits, never streams. Typing edits a
// draft; Enter or leaving the field commits it, Escape puts the value back. A draft
// that is not a number, or is outside min/max, is dropped (the field shows the value
// again). ArrowUp/ArrowDown commit value ± step at once (Shift: ± 10 steps), clamped
// to min/max. Changing `resetKey` drops a draft in progress (e.g. the Document was
// reloaded from disk under it).
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'

export type NumberFieldProps = {
  /** Shown beside the input. */
  label: ReactNode
  /** Accessible name of the input when `label` is not enough (e.g. "W" → "Width"). */
  name?: string
  /** The current value; `undefined` shows an empty input with `placeholder`. */
  value: number | undefined
  /** A new, valid value the user committed. */
  onCommit: (value: number) => void
  min?: number
  max?: number
  /** Arrow key step (Shift: ×10). Default 1. */
  step?: number
  placeholder?: string
  disabled?: boolean
  /** A new value drops the uncommitted draft. */
  resetKey?: unknown
  className?: string
}

/** Arrow key multiplier with Shift. */
const SHIFT_STEPS = 10

/** Up to 4 decimals, no trailing zeros: 0.1 + 0.2 shows as 0.3. */
const format = (value: number) => String(Number(value.toFixed(4)))

const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length

export function NumberField({
  label,
  name,
  value,
  onCommit,
  min,
  max,
  step = 1,
  placeholder,
  disabled,
  resetKey,
  className,
}: NumberFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => setDraft(null), [resetKey])

  const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max)
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))

  /** The draft as a number, or undefined when it is not a valid one. */
  const parse = (text: string): number | undefined => {
    const trimmed = text.trim().replace(',', '.')
    if (trimmed === '') return undefined
    const n = Number(trimmed)
    return Number.isFinite(n) && inRange(n) ? n : undefined
  }

  const commit = () => {
    if (draft === null) return
    const n = parse(draft)
    setDraft(null)
    if (n !== undefined && n !== value) onCommit(n)
  }

  const stepBy = (direction: 1 | -1, shift: boolean) => {
    const base = (draft !== null ? parse(draft) : undefined) ?? value
    if (base === undefined) return
    const next = clamp(Number((base + direction * step * (shift ? SHIFT_STEPS : 1)).toFixed(decimalsOf(step))))
    setDraft(null)
    if (next !== value) onCommit(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(null)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey)
    }
  }

  return (
    <div className={className ? `number-field ${className}` : 'number-field'}>
      <label className="number-field-label" htmlFor={id} title={name}>
        {label}
      </label>
      <input
        id={id}
        className="number-field-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-label={name}
        value={draft ?? (value === undefined ? '' : format(value))}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  )
}
