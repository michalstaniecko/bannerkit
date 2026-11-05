// Same-origin client for the REST adapter (packages/server/src/rest/app.ts).
import type { Document, PresetId } from '@bannerkit/core'

export type ProjectRef = { name: string }
export type DocumentRef = { project: string; name: string }
export type Issue = { path: string; message: string; suggestion?: string }
/** A Document as read or saved. `warnings` include missing Assets, which the editor shows as placeholders. */
export type DocumentResult = DocumentRef & { document: Document; warnings: Issue[] }
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

/** An Asset as stored by an upload: its project-relative `src` and intrinsic size. */
export type UploadedAsset = { src: string; width: number; height: number }

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

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
  /** Uploads image files as Assets (the `addAssets` op: sanitised names, normalised images). */
  uploadAssets: (project: string, files: readonly File[]) => {
    const form = new FormData()
    for (const file of files) form.append('file', file)
    return requestJson<{ project: string; assets: UploadedAsset[] }>(`/api/projects/${seg(project)}/assets`, { method: 'POST', body: form })
  },
  /** Creates an empty Document of a Preset's size. */
  createDocument: (project: string, name: string, preset: PresetId) =>
    requestJson<DocumentResult>(`/api/projects/${seg(project)}/documents`, jsonPost({ name, preset })),
  /** Copies Document `from` onto a Preset's size; the name defaults to `<from>-<W>x<H>`. */
  duplicateDocument: (project: string, from: string, preset: PresetId, name?: string) =>
    requestJson<DocumentResult>(`${documentPath(project, from)}/duplicate`, jsonPost({ preset, ...(name ? { name } : {}) })),
  /** The same-origin URL of a Document's project-relative Asset `src` (e.g. `assets/shoe.png`). */
  assetUrl: (project: string, src: string) => `/api/projects/${seg(project)}/${src.split('/').map(seg).join('/')}`,
}
