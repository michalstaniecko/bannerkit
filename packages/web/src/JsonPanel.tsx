// The Inspector's JSON tab: a CodeMirror 6 view of the live Document, with Apply
// and inline validation errors. It follows the editor (`change` events and loads)
// until the human edits the text; from then on their text is kept until they Apply
// or Revert, so an edit elsewhere never overwrites what they are typing.
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { Check, RotateCcw } from 'lucide-react'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import type { Issue } from '@bannerkit/core'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Editor } from './editor/index.ts'
import { applyJson } from './json-apply.ts'
import { Button } from './ui/Button.tsx'

/** Marks text the panel writes itself, so it is not mistaken for the human's edit. */
const fromEditor = Annotation.define<boolean>()

const format = (editor: Editor) => JSON.stringify(editor.getDocument(), null, 2)

export function JsonPanel({ editor, loaded }: { editor: RefObject<Editor | null>; loaded: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const dirtyRef = useRef(false)
  const [dirty, setDirtyState] = useState(false)
  const [stale, setStale] = useState(false)
  const [errors, setErrors] = useState<Issue[]>([])
  const [applying, setApplying] = useState(false)

  const setDirty = (value: boolean) => {
    dirtyRef.current = value
    setDirtyState(value)
  }

  const show = (text: string) => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === text) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: fromEditor.of(true) })
  }

  /** Shows the editor's Document and drops the human's unapplied text. */
  const revert = () => {
    if (!editor.current) return
    show(format(editor.current))
    setDirty(false)
    setStale(false)
    setErrors([])
  }

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          json(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && update.transactions.some((tr) => tr.docChanged && !tr.annotation(fromEditor))) {
              setDirty(true)
            }
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [])

  useEffect(() => {
    const current = editor.current
    if (!loaded || !current) {
      show('')
      setDirty(false)
      setStale(false)
      setErrors([])
      return
    }
    revert()
    return current.on('change', () => {
      if (dirtyRef.current) setStale(true)
      else show(format(current))
    })
  }, [loaded, editor])

  const apply = async () => {
    const current = editor.current
    const view = viewRef.current
    if (!current || !view) return
    setApplying(true)
    try {
      const result = await applyJson(current, view.state.doc.toString())
      if (result.ok) revert()
      else setErrors(result.errors)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="json-panel">
      <div className="json-actions">
        <Button variant="primary" icon={Check} onClick={() => void apply()} disabled={!loaded || applying}>
          Apply
        </Button>
        <Button icon={RotateCcw} onClick={revert} disabled={!loaded || !dirty}>
          Revert
        </Button>
        {stale && <span className="json-stale">The Document changed since you started editing.</span>}
      </div>
      {errors.length > 0 && (
        <ul className="json-errors">
          {errors.map((issue, i) => (
            <li key={i}>
              <code>{issue.path || '(root)'}</code>: {issue.message}
              {issue.suggestion !== undefined && ` (did you mean "${issue.suggestion}"?)`}
            </li>
          ))}
        </ul>
      )}
      <div className="json-code" ref={hostRef} />
    </div>
  )
}
