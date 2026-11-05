// The top bar's Document actions: create an empty Document from a Preset, or duplicate
// the open one onto a Preset's size (Layers copied unchanged), via REST over the
// `createDocument` / `duplicateDocument` ops. The new Document is then opened.
import { PRESET_IDS, type PresetId } from '@bannerkit/core'
import { useState, type RefObject } from 'react'
import { api } from './api.ts'
import type { Editor } from './editor/index.ts'

type Props = {
  editor: RefObject<Editor | null>
  project: string
  /** The open Document, or '' when none is. */
  doc: string
  loaded: boolean
  /** Opens the Document `name` of the Project (after refreshing the Document list). */
  onOpen: (name: string) => void
  onError: (message: string) => void
}

export function DocumentActions({ editor, project, doc, loaded, onOpen, onError }: Props) {
  const [preset, setPreset] = useState<PresetId>(PRESET_IDS[0]!)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const act = async (request: () => Promise<{ name: string }>) => {
    setBusy(true)
    try {
      const created = await request()
      setName('')
      onOpen(created.name)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const create = () => act(() => api.createDocument(project, name.trim(), preset))

  // The copy is made from disk, so the open Document is saved first.
  const duplicate = () =>
    act(async () => {
      const current = editor.current
      if (current && loaded) await api.writeDocument(project, doc, current.getDocument())
      return api.duplicateDocument(project, doc, preset, name.trim() || undefined)
    })

  return (
    <span className="document-actions">
      <select aria-label="Size" value={preset} onChange={(e) => setPreset(e.target.value as PresetId)} disabled={!project}>
        {PRESET_IDS.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <input
        aria-label="New Document name"
        placeholder="name"
        size={10}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!project}
      />
      <button type="button" onClick={() => void create()} disabled={!project || !name.trim() || busy}>
        New
      </button>
      <button type="button" onClick={() => void duplicate()} disabled={!loaded || busy} title="Duplicate this Document to the chosen size">
        Duplicate to size
      </button>
    </span>
  )
}
