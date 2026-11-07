// Tabs (WAI-ARIA tabs pattern): a tab list and one panel per tab. Every panel stays
// mounted and only the active one is shown, so a panel keeps its own state (the JSON
// panel's unapplied text, a field mid-edit) across switches. Uncontrolled by default
// (first tab active); pass `value` + `onChange` to control it.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface Tab {
  id: string
  label: ReactNode
  content: ReactNode
}

type Props = {
  /** Accessible name of the tab list. */
  label: string
  tabs: Tab[]
  value?: string
  onChange?: (id: string) => void
  className?: string
}

export function Tabs({ label, tabs, value, onChange, className }: Props) {
  const [own, setOwn] = useState(tabs[0]?.id ?? '')
  const active = value ?? own
  const base = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const tabId = (id: string) => `${base}-tab-${id}`
  const panelId = (id: string) => `${base}-panel-${id}`

  const choose = (id: string) => {
    if (value === undefined) setOwn(id)
    onChange?.(id)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    const index = tabs.findIndex((t) => t.id === active)
    let next: number | undefined
    if (step !== undefined) next = (index + step + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next === undefined) return
    e.preventDefault()
    const id = tabs[next]!.id
    choose(id)
    listRef.current?.ownerDocument.getElementById(tabId(id))?.focus()
  }

  return (
    <div className={className ? `tabs ${className}` : 'tabs'}>
      <div className="tabs-list" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
        {tabs.map((t) => {
          const selected = t.id === active
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="tabs-tab"
              id={tabId(t.id)}
              aria-selected={selected}
              aria-controls={panelId(t.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(t.id)}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          className="tabs-panel"
          id={panelId(t.id)}
          aria-labelledby={tabId(t.id)}
          hidden={t.id !== active}
        >
          {t.content}
        </div>
      ))}
    </div>
  )
}
