// Chrome around the editor module: a top bar (Project and Document pickers, zoom)
// and the Canvas viewport. React holds names and the zoom only; the Document and
// every Fabric object live inside the editor module.
import { useEffect, useRef, useState } from 'react'
import { api, type DocumentRef, type ProjectRef } from './api.ts'
import { createEditor, type Editor } from './editor/index.ts'

const VIEWPORT_PADDING = 32
const ZOOM_STEP = 1.25

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
    api
      .readDocument(project, doc)
      .then(async ({ document }) => {
        if (cancelled || !editorRef.current) return
        await editorRef.current.load(document, { assetUrl: (src) => api.assetUrl(project, src) })
        setError(null)
        setLoaded(true)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
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
        <span className="spacer" />
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
      {error && <div className="error">{error}</div>}
      <main className="viewport" ref={viewportRef}>
        <div className="canvas-host" ref={hostRef} hidden={!loaded} />
        {!loaded && !error && <p className="hint">Pick a Project and a Document.</p>}
      </main>
    </div>
  )
}
