// Same-origin client for the REST adapter (packages/server/src/rest/app.ts).
import type { Document } from '@bannerkit/core'

export type ProjectRef = { name: string }
export type DocumentRef = { project: string; name: string }
export type DocumentResult = DocumentRef & { document: Document }
export type ApiError = { code: string; message: string; issues: { path: string; message: string }[] }

export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly error: ApiError) {
    super(error.message)
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  const body = await res.json()
  if (!res.ok) throw new ApiRequestError(res.status, body.error)
  return body as T
}

const seg = encodeURIComponent

export const api = {
  listProjects: () => getJson<ProjectRef[]>('/api/projects'),
  listDocuments: (project: string) => getJson<DocumentRef[]>(`/api/projects/${seg(project)}/documents`),
  readDocument: (project: string, name: string) =>
    getJson<DocumentResult>(`/api/projects/${seg(project)}/documents/${seg(name)}`),
  /** The same-origin URL of a Document's project-relative Asset `src` (e.g. `assets/shoe.png`). */
  assetUrl: (project: string, src: string) => `/api/projects/${seg(project)}/${src.split('/').map(seg).join('/')}`,
}
