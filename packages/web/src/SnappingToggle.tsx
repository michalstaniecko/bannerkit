// The top bar's Snapping switch (slot `topbar-snapping`): a Snapping toggle that turns
// Snapping on or off for the session (not stored in the Document) through
// `editor.setSnapping`. On by default, like the editor. Holding Cmd/Ctrl turns it off
// for one drag only, without touching this switch.
import { Magnet } from 'lucide-react'
import { useState, type RefObject } from 'react'
import type { Editor } from './editor/index.ts'
import { IconButton } from './ui/IconButton.tsx'

type Props = { editor: RefObject<Editor | null>; disabled: boolean }

export function SnappingToggle({ editor, disabled }: Props) {
  const [on, setOn] = useState(true)
  const toggle = () => {
    const next = !on
    setOn(next)
    editor.current?.setSnapping(next)
  }
  return <IconButton icon={Magnet} label="Snapping" shortcut="hold Cmd/Ctrl to drag without it" pressed={on} onClick={toggle} disabled={disabled} />
}
