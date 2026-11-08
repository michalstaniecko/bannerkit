// ColorField and Select on their own, driven by user-event: what they commit. Both
// are reused outside the Layer Inspector (the Canvas background, text and gradient
// fields), so "none", Escape and an unknown value are pinned here.
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ColorField } from '../src/ui/ColorField.tsx'
import { Select } from '../src/ui/Select.tsx'

afterEach(cleanup)

/** A ColorField that shows what it committed, like the Inspector after an update. */
function Background({ initial, commits }: { initial: string | null; commits: (string | null)[] }) {
  const [value, setValue] = useState(initial)
  return (
    <ColorField
      label="Background"
      value={value}
      nullable
      onCommit={(next) => {
        commits.push(next)
        setValue(next)
      }}
    />
  )
}

describe('ColorField', () => {
  it('with `nullable`, "None" commits null and switching it off brings the colour back', async () => {
    const commits: (string | null)[] = []
    render(<Background initial="#336699" commits={commits} />)
    const user = userEvent.setup()
    const none = screen.getByRole('checkbox', { name: 'No background' }) as HTMLInputElement
    const input = screen.getByRole('textbox', { name: 'Background' }) as HTMLInputElement

    await user.click(none)
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('None')
    expect(input.disabled).toBe(true)
    await user.click(none)

    expect(commits).toEqual([null, '#336699'])
    expect(input.value).toBe('#336699')
  })

  it('null with no colour seen before comes back as white', async () => {
    const commits: (string | null)[] = []
    render(<Background initial={null} commits={commits} />)
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'No background' }))
    expect(commits).toEqual(['#ffffff'])
  })

  it('Escape drops the draft; the same colour commits nothing', async () => {
    const commits: (string | null)[] = []
    render(<Background initial="#336699" commits={commits} />)
    const user = userEvent.setup()
    const input = screen.getByRole('textbox', { name: 'Background' }) as HTMLInputElement

    await user.clear(input)
    await user.type(input, 'red{Escape}')
    expect(input.value).toBe('#336699')
    await user.type(input, '{Enter}')
    await user.clear(input)
    await user.type(input, 'red{Enter}')

    expect(commits).toEqual(['red'])
  })

  it('the picker shows a short hex in full', () => {
    render(<ColorField label="Fill" value="#F0a" onCommit={() => {}} />)
    expect((screen.getByLabelText('Fill picker') as HTMLInputElement).value).toBe('#ff00aa')
  })
})

describe('Select', () => {
  it('commits the picked option; an unknown value shows the placeholder', async () => {
    const picked: string[] = []
    render(
      <Select
        label="Align"
        value={undefined}
        placeholder="Mixed"
        options={[
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ]}
        onChange={(v) => picked.push(v)}
      />,
    )
    const select = screen.getByRole('combobox', { name: 'Align' }) as HTMLSelectElement

    expect(select.selectedOptions[0]!.textContent).toBe('Mixed')
    await userEvent.setup().selectOptions(select, 'right')

    expect(picked).toEqual(['right'])
  })
})
