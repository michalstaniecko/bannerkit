// Chrome around the editor module: a top bar (Project and Document pickers, save
// state, undo/redo, zoom) and the Canvas viewport. React holds names, the zoom and the save
// state only; the Document and every Fabric object live inside the editor module.
// Edits reach disk through autosave, fed by the editor's `change` events.
import { useEffect, useRef, useState } from 'react'
import { api, type DocumentRef, type ProjectRef } from './api.ts'
import { createAutosave } from './autosave.ts'
import { createEditor, type Editor } from './editor/index.ts'
import { DocumentActions } from './DocumentActions.tsx'
import { ExportControl } from './ExportControl.tsx'
import { JsonPanel } from './JsonPanel.tsx'
import { LayerList } from './LayerList.tsx'
import { LayerToolbar } from './LayerToolbar.tsx'
import { openLiveReload, type Conflict } from './live-reload.ts'
import { ReloadBanner } from './ReloadBanner.tsx'
import { createSelectionSync } from './selection-sync.ts'

const VIEWPORT_PADDING = 32
const ZOOM_STEP = 1.25

type SaveState = 'saved' | 'unsaved' | 'failed'
const SAVE_LABEL: Record<SaveState, string> = { saved: 'Saved', unsaved: 'Unsaved changes', failed: 'Not saved' }

/** Keeps the picked Project/Document in the URL so a reload reopens them. */
function readSelectionFromUrl() {
  const params = new URLSearchParams(location.search)
  return { project: params.get('project') ?? '', doc: params.get('doc') ?? '' }
}

function writeSelectionToUrl(project: string, doc: string) {
  const params = new URLSearchParams()
  if (project) params.set('project', project)
  if (doc) params.set('doc', doc)
  const query = params.toString()
  history.replaceState(null, '', query ? `?${query}` : location.pathname)
}

export function App() {
  const initial = readSelectionFromUrl()
  const [projects, setProjects] = useState<ProjectRef[]>([])
  const [documents, setDocuments] = useState<DocumentRef[]>([])
  const [project, setProject] = useState(initial.project)
  const [doc, setDoc] = useState(initial.doc)
  const [loaded, setLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [save, setSave] = useState<SaveState>('saved')
  const [history, setHistory] = useState({ undo: false, redo: false })
  const [conflict, setConflict] = useState<Conflict | null>(null)

  const hostRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)

  useEffect(() => {
    const editor = createEditor()
    editor.mount(hostRef.current!)
    editorRef.current = editor
    return () => {
      editorRef.current = null
      void editor.destroy()
    }
  }, [])

  useEffect(() => {
    api.listProjects().then(setProjects, (e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    setDocuments([])
    if (!project) return
    api.listDocuments(project).then(setDocuments, (e: Error) => setError(e.message))
  }, [project])

  useEffect(() => {
    writeSelectionToUrl(project, doc)
    setLoaded(false)
    if (!project || !doc) return
    let cancelled = false
    // Every change the human makes is autosaved; `changes` tells a finished save
    // whether a newer change is still waiting.
    let changes = 0
    const autosave = createAutosave(
      async (document) => {
        const saving = changes
        live.known((await api.writeDocument(project, doc, document)).hash)
        if (!cancelled && saving === changes) setSave('saved')
      },
      { onError: (e) => !cancelled && (setSave('failed'), setError(`Not saved: ${(e as Error).message}`)) },
    )
    // The Selection goes to the server (debounced) so an agent's `inspect` sees it.
    const selectionSync = createSelectionSync((ids) => api.writeSelection(project, doc, ids), {
      onError: (e) => console.warn('Selection not recorded:', e),
    })
    // A change on disk reloads a clean editor, or asks "reload / keep mine" (live-reload.ts).
    const live = openLiveReload({ project, doc }, {
      editor: editorRef.current!,
      autosave,
      read: () => api.readDocument(project, doc),
      onConflict: (c) => !cancelled && setConflict(c),
      onError: (e) => !cancelled && setError(`Reload failed: ${(e as Error).message}`),
    })
    let unsubscribe = () => {}
    let unsubscribeSelection = () => {}
    live.connected
      .then(() => api.readDocument(project, doc))
      .then(async ({ document, hash }) => {
        const editor = editorRef.current
        if (cancelled || !editor) return
        await editor.load(document, { assetUrl: (src) => api.assetUrl(project, src) })
        if (cancelled) return
        const syncHistory = () => setHistory({ undo: editor.canUndo(), redo: editor.canRedo() })
        syncHistory()
        // Undo and redo are changes too, so they are autosaved like any edit.
        unsubscribe = editor.on('change', (event) => {
          syncHistory()
          // A reload shows what is on disk already: nothing to save.
          if (event.cause === 'reload') return setSave('saved')
          changes++
          setSave('unsaved')
          autosave.schedule(event.document)
        })
        unsubscribeSelection = editor.on('selection', ({ layerIds }) => selectionSync.schedule(layerIds))
        selectionSync.schedule(editor.getSelection())
        setError(null)
        setSave('saved')
        setLoaded(true)
        live.ready(hash)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
      live.stop()
      setConflict(null)
      unsubscribe()
      unsubscribeSelection()
      selectionSync.cancel()
      // Switching Documents saves the last edits of this one right away.
      void autosave.flush()
    }
  }, [project, doc])

  // Fit mode follows the viewport size; manual zoom stays put.
  useEffect(() => {
    const viewport = viewportRef.current!
    const refit = () => {
      const editor = editorRef.current
      if (!editor || !loaded) return
      if (fit) {
        setZoom(
          editor.zoomToFit({
            width: viewport.clientWidth - VIEWPORT_PADDING,
            height: viewport.clientHeight - VIEWPORT_PADDING,
          }),
        )
      } else {
        editor.setZoom(zoom)
      }
    }
    refit()
    const observer = new ResizeObserver(refit)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [loaded, fit, zoom])

  // A Document made by the top bar's New / Duplicate to size: list it and open it.
  const openDocument = (name: string) => {
    api.listDocuments(project).then(setDocuments, (e: Error) => setError(e.message))
    setDoc(name)
  }

  const zoomBy = (factor: number) => {
    setFit(false)
    setZoom((z) => z * factor)
  }

  return (
    <div className="app">
      <header className="topbar">
        <label>
          Project{' '}
          <select
            value={project}
            onChange={(e) => {
              setProject(e.target.value)
              setDoc('')
            }}
          >
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Document{' '}
          <select value={doc} onChange={(e) => setDoc(e.target.value)} disabled={!project}>
            <option value="">—</option>
            {documents.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <DocumentActions editor={editorRef} project={project} doc={doc} loaded={loaded} onOpen={openDocument} onError={setError} />
        <LayerToolbar editor={editorRef} project={project} loaded={loaded} onError={setError} />
        <span className="spacer" />
        {loaded && (
          <span className="save" data-state={save}>
            {SAVE_LABEL[save]}
          </span>
        )}
        <button type="button" onClick={() => void editorRef.current?.undo()} disabled={!loaded || !history.undo} title="Undo (Ctrl/Cmd+Z)">
          Undo
        </button>
        <button type="button" onClick={() => void editorRef.current?.redo()} disabled={!loaded || !history.redo} title="Redo (Ctrl/Cmd+Shift+Z)">
          Redo
        </button>
        <ExportControl editor={editorRef} name={doc} disabled={!loaded} onError={setError} />
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={!loaded}>
          −
        </button>
        <span className="zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} disabled={!loaded}>
          +
        </button>
        <button type="button" onClick={() => setFit(true)} disabled={!loaded || fit}>
          Fit
        </button>
        <button type="button" onClick={() => { setFit(false); setZoom(1) }} disabled={!loaded}>
          100%
        </button>
      </header>
      <ReloadBanner conflict={conflict} />
      {error && <div className="error">{error}</div>}
      <div className="workspace">
        <LayerList editor={editorRef} loaded={loaded} onError={setError} />
        <main className="viewport" ref={viewportRef}>
          <div className="canvas-host" ref={hostRef} hidden={!loaded} />
          {!loaded && !error && <p className="hint">Pick a Project and a Document.</p>}
        </main>
        <JsonPanel editor={editorRef} loaded={loaded} />
      </div>
    </div>
  )
}
