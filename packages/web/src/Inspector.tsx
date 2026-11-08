// The right-hand Inspector: a "Properties" tab (the Selection, or the Document when
// nothing is selected) and a "JSON" tab (the JSON panel). Both tabs stay mounted, so
// the JSON panel keeps unapplied text and its dirty / stale state while hidden.
import type { Anchor } from '@bannerkit/core'
import type { RefObject } from 'react'
import type { Editor } from './editor/index.ts'
import { Properties } from './inspector/Properties.tsx'
import { JsonPanel } from './JsonPanel.tsx'
import { Panel } from './ui/Panel.tsx'
import { Tabs } from './ui/Tabs.tsx'

type Props = {
  editor: RefObject<Editor | null>
  loaded: boolean
  /** The Anchor the Document's Canvas size fields resize from (UI state of the session). */
  anchor: Anchor
  onAnchorChange: (anchor: Anchor) => void
}

export function Inspector({ editor, loaded, anchor, onAnchorChange }: Props) {
  return (
    <Panel label="Inspector" className="inspector">
      <Tabs
        label="Inspector"
        className="inspector-tabs"
        tabs={[
          { id: 'properties', label: 'Properties', content: <Properties editor={editor} loaded={loaded} anchor={anchor} onAnchorChange={onAnchorChange} /> },
          { id: 'json', label: 'JSON', content: <JsonPanel editor={editor} loaded={loaded} /> },
        ]}
      />
    </Panel>
  )
}
