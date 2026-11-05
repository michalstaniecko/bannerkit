// What the Document operations answer with: shared by the server (the ops and the
// adapters over them) and the editor's REST client, so both read the same shape.
import type { Document } from './document.ts'
import type { Issue } from './validate.ts'

/** Where a Document lives: its Project, its name and the path of its file. */
export type DocumentRef = { project: string; name: string; path: string }

/**
 * A Document as read or written, with its validation warnings (for the editor, missing
 * Assets, shown as placeholders). `hash` is the content hash of the file's bytes, the
 * one live-reload `document-changed` events carry.
 */
export type DocumentResult = DocumentRef & { document: Document; warnings: Issue[]; hash: string }
