// UI components in jsdom: Tabs switches panels and keeps the inactive ones mounted,
// so a panel's own state (e.g. the JSON panel's unapplied text) survives a switch.
import { act, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Tabs } from '../src/ui/Tabs.tsx'
import { render } from './render.tsx'

const tab = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === name)!
const visiblePanels = () =>
  [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.textContent)

/** A panel with its own state, to show it survives being hidden. */
function Counter() {
  const [n, setN] = useState(0)
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      count {n}
    </button>
  )
}

const TABS = [
  { id: 'properties', label: 'Properties', content: <p>props</p> },
  { id: 'json', label: 'JSON', content: <Counter /> },
]

describe('Tabs', () => {
  it('shows the first tab, labelled for assistive tech', () => {
    render(<Tabs label="Inspector" tabs={TABS} />)

    expect(document.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe('Inspector')
    expect(tab('Properties').getAttribute('aria-selected')).toBe('true')
    expect(tab('JSON').getAttribute('aria-selected')).toBe('false')
    expect(visiblePanels()).toEqual(['props'])
    const panel = document.getElementById(tab('Properties').getAttribute('aria-controls')!)!
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Properties').id)
  })

  it('clicking a tab shows its panel; hidden panels keep their state', () => {
    render(<Tabs label="Inspector" tabs={TABS} />)

    act(() => tab('JSON').click())
    act(() => document.querySelector<HTMLButtonElement>('[role="tabpanel"] button')!.click())
    expect(visiblePanels()).toEqual(['count 1'])

    act(() => tab('Properties').click())
    act(() => tab('JSON').click())
    expect(visiblePanels()).toEqual(['count 1'])
  })

  it('arrow keys move between tabs and focus the new one', () => {
    render(<Tabs label="Inspector" tabs={TABS} />)
    const key = (target: HTMLElement, k: string) =>
      act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })))

    key(tab('Properties'), 'ArrowRight')
    expect(tab('JSON').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('JSON'))

    key(tab('JSON'), 'ArrowRight')
    expect(tab('Properties').getAttribute('aria-selected')).toBe('true')

    key(tab('Properties'), 'ArrowLeft')
    expect(tab('JSON').getAttribute('aria-selected')).toBe('true')
    expect(tab('Properties').tabIndex).toBe(-1)
    expect(tab('JSON').tabIndex).toBe(0)
  })

  it('can be controlled by its owner', () => {
    const seen: string[] = []
    function Owner() {
      const [value, setValue] = useState('json')
      return (
        <Tabs
          label="Inspector"
          tabs={TABS}
          value={value}
          onChange={(id) => {
            seen.push(id)
            setValue(id)
          }}
        />
      )
    }
    render(<Owner />)

    expect(tab('JSON').getAttribute('aria-selected')).toBe('true')
    act(() => tab('Properties').click())
    expect(seen).toEqual(['properties'])
    expect(visiblePanels()).toEqual(['props'])
  })
})
