// The operations layer (ADR 0005): typed, zod-validated functions that return
// results and throw OpError. No console output, no process.exit. The CLI and
// REST are thin adapters over these.
export { OpError, type OpErrorCode, type OpIssue } from './errors.ts'
export { createProject, type CreateProjectInput, type ProjectRef } from './projects.ts'
export {
  createDocument,
  duplicateDocument,
  listDocuments,
  readDocument,
  writeDocument,
  type CreateDocumentInput,
  type DocumentRef,
  type DocumentResult,
  type DuplicateDocumentInput,
} from './documents.ts'
export { preview, type PreviewResult } from './preview.ts'
export { DEFAULT_PROJECTS_DIR, resolveProjectsRoot } from './root.ts'
