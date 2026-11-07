// Chrome around the editor module: a top bar (Project and Document pickers, Document
// and Layer actions, save state, undo/redo, zoom, Export), the Layer list (left), the
// Canvas area (centre) and the Inspector (right). React holds names, the zoom and the save
// state only; the Document and every Fabric object live inside the editor module.
// Edits reach disk through autosave, fed by the editor's `change` events.
import { Maximize, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, isConflict, type DocumentRef, type ProjectRef } from './api.ts'
import { createAutosave } from './autosave.ts'
import { createEditor, type Editor } from './editor/index.ts'
import { CanvasArea } from './CanvasArea.tsx'
import { DocumentActions } from './DocumentActions.tsx'
import { ExportControl } from './ExportControl.tsx'
import { Inspector } from './Inspector.tsx'
import { LayerList } from './LayerList.tsx'
import { LayerToolbar } from './LayerToolbar.tsx'
import { SaveConflict, openLiveReload, type Conflict } from './live-reload.ts'
import { ReloadBanner } from './ReloadBanner.tsx'
import { createSelectionSync } from './selection-sync.ts'
import { Button } from './ui/Button.tsx'
import { IconButton } from './ui/IconButton.tsx'

const VIEWPORT_PADDING = 32
const ZOOM_STEP = 1.25

type SaveState = 'saved' | 'unsaved' | 'failed'
const SAVE_LABEL: Record<SaveState, string> = { saved: 'Saved', unsaved: 'Unsaved changes', failed: 'Not saved' }

/** The opened Document's location (Project and Document) is kept in the URL, so a page reload reopens it. */
function readOpenedFromUrl() {
  const params = new URLSearchParams(location.search)
  return { project: params.get('project') ?? '', doc: params.get('doc') ?? '' }
}

function writeOpenedToUrl(project: string, doc: string) {
  const params = new URLSearchParams()
  if (project) params.set('project', project)
  if (doc) params.set('doc', doc)
  const query = params.toString()
  history.replaceState(null, '', query ? `?${query}` : location.pathname)
}

export function App() {
  const initial = readOpenedFromUrl()
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
  /** Saves the open Document now, through live reload's conditional save (null while none is open). */
  const saveNowRef = useRef<(() => Promise<void>) | null>(null)

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
    writeOpenedToUrl(project, doc)
    setLoaded(false)
    if (!project || !doc) return
    let cancelled = false
    // Every change the human makes is autosaved; `changes` tells a finished save
    // whether a newer change is still waiting.
    let changes = 0
    const autosave = createAutosave(
      async (document) => {
        const saving = changes
        await live.save(document)
        if (!cancelled && saving === changes) setSave('saved')
      },
      {
        onError: (e) => {
          if (cancelled) return
          // A save refused because the file changed on disk shows the reload / keep mine banner instead.
          if (e instanceof SaveConflict) return setSave('unsaved')
          setSave('failed')
          setError(`Not saved: ${(e as Error).message}`)
        },
      },
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
      // Written only over the version last loaded or saved; a change on disk raises the banner.
      write: (document, expectedHash) =>
        api.writeDocument(project, doc, document, { expectedHash }).catch((e: unknown) => {
          if (isConflict(e)) return { conflict: true as const }
          throw e
        }),
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
        saveNowRef.current = () => live.saveNow(editor.getDocument())
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
      saveNowRef.current = null
      live.stop()
      setConflict(null)
      unsubscribe()
      unsubscribeSelection()
      selectionSync.cancel()
      // Switching Documents saves the last edits of this one right away. (Not while a
      // reload / keep mine choice is pending: the pickers are disabled until it is made.)
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
        <div className="toolbar-group" role="group" aria-label="Open">
          <label className="field-inline">
            Project{' '}
            <select
              value={project}
              disabled={conflict !== null}
              title={conflict ? 'Reload or keep your edits first' : undefined}
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
          <label className="field-inline">
            Document{' '}
            <select
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              disabled={!project || conflict !== null}
              title={conflict ? 'Reload or keep your edits first' : undefined}
            >
              <option value="">—</option>
              {documents.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DocumentActions saveNow={saveNowRef} project={project} doc={doc} loaded={loaded} disabled={conflict !== null} onOpen={openDocument} onError={setError} />
        <LayerToolbar editor={editorRef} project={project} loaded={loaded} onError={setError} />
        <span className="spacer" />
        {loaded && (
          <span className="save" data-state={save}>
            {SAVE_LABEL[save]}
          </span>
        )}
        <div className="toolbar-group" role="group" aria-label="History">
          <IconButton icon={Undo2} label="Undo" shortcut="Ctrl/Cmd+Z" onClick={() => void editorRef.current?.undo()} disabled={!loaded || !history.undo} />
          <IconButton icon={Redo2} label="Redo" shortcut="Ctrl/Cmd+Shift+Z" onClick={() => void editorRef.current?.redo()} disabled={!loaded || !history.redo} />
        </div>
        {/* Room for the Snapping switch (M3). */}
        <div className="toolbar-group topbar-snapping" role="group" aria-label="Snapping" />
        <div className="toolbar-group" role="group" aria-label="Zoom">
          <IconButton icon={ZoomOut} label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={!loaded} />
          <span className="zoom">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton icon={ZoomIn} label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} disabled={!loaded} />
          <IconButton icon={Maximize} label="Fit" pressed={fit} onClick={() => setFit(true)} disabled={!loaded || fit} />
          <Button variant="ghost" onClick={() => { setFit(false); setZoom(1) }} disabled={!loaded} title="Actual size">
            100%
          </Button>
        </div>
        <ExportControl editor={editorRef} name={doc} disabled={!loaded} onError={setError} />
      </header>
      <ReloadBanner conflict={conflict} />
      {error && <div className="error">{error}</div>}
      <div className="editor-body">
        <LayerList editor={editorRef} loaded={loaded} onError={setError} />
        <CanvasArea
          viewportRef={viewportRef}
          hostRef={hostRef}
          loaded={loaded}
          placeholder={!error && <p className="hint">Pick a Project and a Document.</p>}
        />
        <Inspector editor={editorRef} loaded={loaded} />
      </div>
    </div>
  )
}
