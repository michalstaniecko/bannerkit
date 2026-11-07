// ColorField: a CSS colour typed into a text input or picked from a native colour
// picker, with an optional "none" switch (`nullable`: the Canvas background, where
// `null` is transparent). Like NumberField it commits, never streams: typing edits a
// draft that Enter or leaving the field commits and Escape drops; dragging in the
// picker only previews in the text input and commits once, when the picker closes.
// A draft that is not a CSS colour is dropped. Changing `resetKey` drops a draft.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export type ColorFieldProps = {
  /** Shown beside the inputs. */
  label: ReactNode
  /** Accessible name when `label` is not a string (the picker is "<name> picker"). */
  name?: string
  /**
   * The current colour; `null` is "none" (only with `nullable`); `undefined` shows an
   * empty input with `placeholder` (e.g. a gradient, or several different colours).
   */
  value: string | null | undefined
  /** A new colour the user committed, or `null` for "none". */
  onCommit: (value: string | null) => void
  /** Offers a "None" switch that commits `null`. */
  nullable?: boolean
  /** The colour committed when "None" is switched off and no colour was shown before. Default white. */
  fallback?: string
  placeholder?: string
  disabled?: boolean
  /** A new value drops the uncommitted draft. */
  resetKey?: unknown
  className?: string
}

/** Whether `text` is a CSS colour (hex, rgb(), hsl(), a named colour, ...). */
export function isColor(text: string): boolean {
  if (text.trim() === '') return false
  const style = document.createElement('span').style
  style.color = text
  return style.color !== ''
}

/** `#rrggbb` for the native picker, which knows nothing else; other colours show black. */
function pickerHex(value: string | null | undefined): string {
  const hex = value?.trim().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1]
  if (!hex) return '#000000'
  const six = hex.length <= 4 ? [...hex.slice(0, 3)].map((c) => c + c).join('') : hex.slice(0, 6)
  return `#${six.toLowerCase()}`
}

export function ColorField({
  label,
  name,
  value,
  onCommit,
  nullable,
  fallback = '#ffffff',
  placeholder,
  disabled,
  resetKey,
  className,
}: ColorFieldProps) {
  const id = useId()
  const accessibleName = name ?? (typeof label === 'string' ? label : undefined)
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => setDraft(null), [resetKey])

  // The last colour shown, restored when "None" is switched off.
  const lastColor = useRef(fallback)
  if (typeof value === 'string') lastColor.current = value

  const commit = (text: string | null) => {
    setDraft(null)
    if (text === null) return
    const next = text.trim()
    if (next !== value && isColor(next)) onCommit(next)
  }

  // The picker's `change` (its dialog closed) commits; React's onChange is its `input`.
  const picker = useRef<HTMLInputElement>(null)
  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => {
    const input = picker.current
    if (!input) return
    const onChange = () => commitRef.current(input.value)
    input.addEventListener('change', onChange)
    return () => input.removeEventListener('change', onChange)
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(null)
    }
  }

  const none = !!nullable && value === null
  return (
    <div className={className ? `color-field ${className}` : 'color-field'}>
      <label className="color-field-label" htmlFor={id} title={name}>
        {label}
      </label>
      <input
        ref={picker}
        className="color-field-swatch"
        type="color"
        aria-label={accessibleName && `${accessibleName} picker`}
        value={pickerHex(draft ?? value)}
        disabled={disabled || none}
        onChange={(e) => setDraft(e.target.value)}
      />
      <input
        id={id}
        className="color-field-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        aria-label={name}
        value={draft ?? (typeof value === 'string' ? value : '')}
        placeholder={none ? 'None' : placeholder}
        disabled={disabled || none}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
      />
      {nullable && (
        <label className="checkbox color-field-none">
          <input
            type="checkbox"
            aria-label={accessibleName && `No ${accessibleName.toLowerCase()}`}
            checked={none}
            disabled={disabled}
            onChange={(e) => {
              setDraft(null)
              onCommit(e.target.checked ? null : lastColor.current)
            }}
          />
          None
        </label>
      )}
    </div>
  )
}
