// NumberField: a labelled number input that commits, never streams. Typing edits a
// draft; Enter or leaving the field commits it, Escape puts the value back. A draft
// that is not a number, or is outside min/max, is dropped (the field shows the value
// again). ArrowUp/ArrowDown commit value ± step at once (Shift: ± 10 steps), clamped
// to min/max. Changing `resetKey` drops a draft in progress (e.g. the Document was
// reloaded from disk under it).
//
// With `onPreview`, dragging the label left/right changes the value by one step per px
// (Shift: 10 steps), clamped to min/max: each new value goes to `onPreview`, the release
// to `onCommit` (or `onCancel` when it ends where it started). Escape cancels the drag;
// a new `resetKey` ends it without a word (whoever changed the key dropped the preview).
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

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
  /** A value while the label is dragged; enables the drag. The release goes to `onCommit`. */
  onPreview?: (value: number) => void
  /** A drag ended without a new value (Escape, or released where it started). */
  onCancel?: () => void
  /** A new value drops the uncommitted draft and ends a drag. */
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
  onPreview,
  onCancel,
  resetKey,
  className,
}: NumberFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  /** The value shown while the label is dragged. */
  const [dragged, setDragged] = useState<number | null>(null)
  /** Ends the drag in progress (removes its listeners), if any. */
  const endDrag = useRef<(() => void) | null>(null)
  /** Whether the last press on the label moved it, so its click does not focus the input. */
  const moved = useRef(false)
  useEffect(() => {
    setDraft(null)
    endDrag.current?.()
  }, [resetKey])
  useEffect(() => () => endDrag.current?.(), [])

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

  const onLabelMouseDown = (e: MouseEvent<HTMLLabelElement>) => {
    if (!onPreview || disabled || value === undefined || e.button !== 0) return
    e.preventDefault()
    endDrag.current?.()
    const start = value
    const startX = e.clientX
    const decimals = decimalsOf(step)
    let current = start
    moved.current = false
    const view = e.currentTarget.ownerDocument

    const move = (event: globalThis.MouseEvent) => {
      const steps = (event.clientX - startX) * (event.shiftKey ? SHIFT_STEPS : 1)
      const next = clamp(Number((start + steps * step).toFixed(decimals)))
      if (event.clientX !== startX) moved.current = true
      if (next === current) return
      current = next
      setDragged(next)
      onPreview(next)
    }
    const up = () => {
      stop()
      if (current !== start) onCommit(current)
      else onCancel?.()
    }
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      stop()
      onCancel?.()
    }
    const stop = () => {
      view.removeEventListener('mousemove', move)
      view.removeEventListener('mouseup', up)
      view.removeEventListener('keydown', key, true)
      endDrag.current = null
      setDragged(null)
    }
    view.addEventListener('mousemove', move)
    view.addEventListener('mouseup', up)
    view.addEventListener('keydown', key, true)
    endDrag.current = stop
    setDraft(null)
  }

  const onLabelClick = (e: MouseEvent<HTMLLabelElement>) => {
    if (moved.current) e.preventDefault()
    moved.current = false
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
      <label
        className={onPreview && !disabled ? 'number-field-label number-field-label-drag' : 'number-field-label'}
        htmlFor={id}
        title={name}
        onMouseDown={onLabelMouseDown}
        onClick={onLabelClick}
      >
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
        value={dragged !== null ? format(dragged) : (draft ?? (value === undefined ? '' : format(value)))}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  )
}
