// The right-hand Inspector: a "Properties" tab (the Selection, or the Document when
// nothing is selected) and a "JSON" tab (the JSON panel). Both tabs stay mounted, so
// the JSON panel keeps unapplied text and its dirty / stale state while hidden.
import type { RefObject } from 'react'
import type { Editor } from './editor/index.ts'
import { Properties } from './inspector/Properties.tsx'
import { JsonPanel } from './JsonPanel.tsx'
import { Panel } from './ui/Panel.tsx'
import { Tabs } from './ui/Tabs.tsx'

type Props = {
  editor: RefObject<Editor | null>
  loaded: boolean
}

export function Inspector({ editor, loaded }: Props) {
  return (
    <Panel label="Inspector" className="inspector">
      <Tabs
        label="Inspector"
        className="inspector-tabs"
        tabs={[
          { id: 'properties', label: 'Properties', content: <Properties editor={editor} loaded={loaded} /> },
          { id: 'json', label: 'JSON', content: <JsonPanel editor={editor} loaded={loaded} /> },
        ]}
      />
    </Panel>
  )
}
