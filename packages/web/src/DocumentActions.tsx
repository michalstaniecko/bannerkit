// The top bar's Document actions: create an empty Document from a Preset, or duplicate
// the open one onto a Preset's size (Layers copied unchanged), via REST over the
// `createDocument` / `duplicateDocument` ops. The new Document is then opened.
import { PRESET_IDS, type PresetId } from '@bannerkit/core'
import { useState, type RefObject } from 'react'
import { api } from './api.ts'
import { SaveConflict } from './live-reload.ts'

type Props = {
  /**
   * Saves the open Document now, only over the version the editor last had (live
   * reload's conditional save). Rejects with SaveConflict, banner shown, if the file
   * changed on disk.
   */
  saveNow: RefObject<(() => Promise<void>) | null>
  project: string
  /** The open Document, or '' when none is. */
  doc: string
  loaded: boolean
  /** True while opening another Document must wait (a reload / keep mine choice is pending). */
  disabled: boolean
  /** Opens the Document `name` of the Project (after refreshing the Document list). */
  onOpen: (name: string) => void
  onError: (message: string) => void
}

export function DocumentActions({ saveNow, project, doc, loaded, disabled, onOpen, onError }: Props) {
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
      // A refused save shows the reload / keep mine banner; nothing is duplicated.
      if (e instanceof SaveConflict) return
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const create = () => act(() => api.createDocument(project, name.trim(), preset))

  // The copy is made from disk, so the open Document is saved first (never over a
  // change made on disk: that raises the reload / keep mine banner and aborts).
  const duplicate = () =>
    act(async () => {
      if (loaded) await saveNow.current?.()
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
      <button type="button" onClick={() => void create()} disabled={!project || !name.trim() || busy || disabled}>
        New
      </button>
      <button type="button" onClick={() => void duplicate()} disabled={!loaded || busy || disabled} title="Duplicate this Document to the chosen size">
        Duplicate to size
      </button>
    </span>
  )
}
