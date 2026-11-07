// The Inspector's Properties tab rendered with a real editor (jsdom + node-canvas),
// driven by user-event like a human: fields are found by their accessible names.
import type { Document } from '@bannerkit/core'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach } from 'vitest'
import { Properties } from '../src/inspector/Properties.tsx'
import { openEditor } from './editor-harness.ts'

afterEach(cleanup)

/**
 * Opens `document_` in a real editor (see `openEditor`), selects `select` and renders
 * the Properties tab for it. `field(name)` finds a field by its accessible name.
 */
export async function openInspector(document_: Document, { select = [] }: { select?: string[] } = {}) {
  const opened = await openEditor(document_)
  opened.editor.select(select)
  const user = userEvent.setup()
  const view = render(<Properties editor={{ current: opened.editor }} loaded />)
  const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement
  const toggle = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
  return { ...opened, user, view, field, toggle }
}

/** Waits for pending editor work (an `update` resolves after a microtask or two). */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
