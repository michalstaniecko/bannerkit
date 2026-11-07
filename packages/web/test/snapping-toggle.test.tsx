// The top bar's Snapping switch: a magnet toggle button that turns Snapping on and off
// for the session through `editor.setSnapping`.
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Editor } from '../src/editor/index.ts'
import { SnappingToggle } from '../src/SnappingToggle.tsx'

afterEach(cleanup)

describe('SnappingToggle', () => {
  it('starts on, and each click flips it and calls setSnapping', async () => {
    const calls: boolean[] = []
    const editor = { setSnapping: (on: boolean) => calls.push(on) } as unknown as Editor
    render(<SnappingToggle editor={{ current: editor }} disabled={false} />)
    const button = screen.getByRole('button', { name: 'Snapping' })
    expect(button.getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(calls).toEqual([false, true])
  })

  it('names Cmd/Ctrl in its tooltip and can be disabled', () => {
    render(<SnappingToggle editor={{ current: null }} disabled />)
    const button = screen.getByRole('button', { name: 'Snapping' }) as HTMLButtonElement
    expect(button.title).toBe('Snapping (hold Cmd/Ctrl to drag without it)')
    expect(button.disabled).toBe(true)
  })
})
