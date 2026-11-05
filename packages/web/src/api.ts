// Same-origin client for the REST adapter (packages/server/src/rest/app.ts).
import type { Document } from '@bannerkit/core'

export type ProjectRef = { name: string }
export type DocumentRef = { project: string; name: string }
export type Issue = { path: string; message: string; suggestion?: string }
/**
 * A Document as read or saved. `warnings` include missing Assets, which the editor shows as placeholders.
 * `hash` is the content hash of the file on disk, the one live-reload `document-changed` events carry.
 */
export type DocumentResult = DocumentRef & { document: Document; warnings: Issue[]; hash: string }
export type ApiError = { code: string; message: string; issues: Issue[] }

export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly error: ApiError) {
    super(error.issues.length > 0 ? `${error.message}: ${error.issues.map((i) => `${i.path} ${i.message}`).join('; ')}` : error.message)
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json()
  if (!res.ok) throw new ApiRequestError(res.status, body.error)
  return body as T
}

const seg = encodeURIComponent
const documentPath = (project: string, name: string) => `/api/projects/${seg(project)}/documents/${seg(name)}`

export const api = {
  listProjects: () => requestJson<ProjectRef[]>('/api/projects'),
  listDocuments: (project: string) => requestJson<DocumentRef[]>(`/api/projects/${seg(project)}/documents`),
  readDocument: (project: string, name: string) => requestJson<DocumentResult>(documentPath(project, name)),
  /** Saves the whole Document; the server validates it and writes it atomically. */
  writeDocument: (project: string, name: string, document: Document) =>
    requestJson<DocumentResult>(documentPath(project, name), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(document),
    }),
  /** Records the editor's Selection in the Project's `.state.json`, where `bannerkit inspect` reads it. */
  writeSelection: (project: string, doc: string, selectedLayerIds: string[]) =>
    requestJson<{ doc: string; selectedLayerIds: string[] }>(`/api/projects/${seg(project)}/selection`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc, selectedLayerIds }),
    }),
  /** The same-origin URL of a Document's project-relative Asset `src` (e.g. `assets/shoe.png`). */
  assetUrl: (project: string, src: string) => `/api/projects/${seg(project)}/${src.split('/').map(seg).join('/')}`,
}
