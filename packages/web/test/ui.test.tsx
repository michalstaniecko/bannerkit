// UI components in jsdom: what a user (or assistive tech) gets from Button, IconButton
// and Panel/Section.
import { Undo2 } from 'lucide-react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { Button } from '../src/ui/Button.tsx'
import { Checkbox } from '../src/ui/Checkbox.tsx'
import { IconButton } from '../src/ui/IconButton.tsx'
import { Panel, Section } from '../src/ui/Panel.tsx'
import { render } from './render.tsx'

describe('IconButton', () => {
  it('is named by its label, shows it (and the shortcut) as a tooltip, and draws only the icon', () => {
    const clicks: string[] = []
    const host = render(<IconButton icon={Undo2} label="Undo" shortcut="Ctrl/Cmd+Z" onClick={() => clicks.push('undo')} />)
    const button = host.querySelector('button')!

    expect(button.getAttribute('aria-label')).toBe('Undo')
    expect(button.title).toBe('Undo (Ctrl/Cmd+Z)')
    expect(button.type).toBe('button')
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    act(() => button.click())
    expect(clicks).toEqual(['undo'])
  })

  it('can be disabled and pressed (a toggle)', () => {
    const host = render(<IconButton icon={Undo2} label="Snapping" pressed disabled />)
    const button = host.querySelector('button')!
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Button', () => {
  it('is a plain button with its text, an optional icon and a variant', () => {
    const host = render(
      <Button icon={Undo2} variant="primary">
        Apply
      </Button>,
    )
    const button = host.querySelector('button')!
    expect(button.type).toBe('button')
    expect(button.textContent).toBe('Apply')
    expect(button.dataset.variant).toBe('primary')
    expect(button.querySelector('svg')).not.toBeNull()
  })
})

describe('Panel and Section', () => {
  it('a Panel is a labelled region; a Section is named by its heading', () => {
    const host = render(
      <Panel label="Inspector">
        <Section title="Layout">
          <p>x</p>
        </Section>
      </Panel>,
    )
    expect(host.querySelector('aside')!.getAttribute('aria-label')).toBe('Inspector')
    const section = host.querySelector('section')!
    const heading = section.querySelector('h2')!
    expect(heading.textContent).toBe('Layout')
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id)
  })

  it('a Section can hold actions beside its heading', () => {
    const host = render(
      <Section title="Shadow" actions={<IconButton icon={Undo2} label="Remove shadow" />}>
        <p>x</p>
      </Section>,
    )
    expect(host.querySelector('.section-header [aria-label="Remove shadow"]')).not.toBeNull()
  })
})

describe('Checkbox', () => {
  it('shows Mixed as indeterminate; a click turns it on', () => {
    const changes: boolean[] = []
    const host = render(<Checkbox label="Visible" checked mixed onChange={(value) => changes.push(value)} />)
    const input = host.querySelector('input')!

    expect([input.indeterminate, input.checked, input.getAttribute('aria-checked')]).toEqual([true, false, 'mixed'])
    act(() => input.click())
    expect(changes).toEqual([true])
  })
})
