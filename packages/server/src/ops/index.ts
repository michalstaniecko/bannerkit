// The operations layer (ADR 0005): typed, zod-validated functions that return
// results and throw OpError. No console output, no process.exit. The CLI and
// REST are thin adapters over these.
export { OpError, type OpErrorCode, type OpIssue } from './errors.ts'
export { createProject, listProjects, type CreateProjectInput, type ProjectRef } from './projects.ts'
export {
  createDocument,
  duplicateDocument,
  listDocuments,
  readDocument,
  resizeDocument,
  writeDocument,
  type CreateDocumentInput,
  type DocumentRef,
  type DocumentResult,
  type DuplicateDocumentInput,
  type ResizeDocumentInput,
} from './documents.ts'
export {
  SERVER_DOCUMENT_RULES,
  SERVER_RULES,
  validate,
  type DocumentContext,
  type DocumentValidation,
  type ServerRule,
  type ValidateResult,
} from './validation.ts'
export { preview, type PreviewResult } from './preview.ts'
export { exportDocument, render, type ExportDocumentInput, type ExportFile, type RenderInput, type RenderResult } from './render.ts'
export {
  inspect,
  type InspectResult,
  type LayerInspection,
  type TextInspection,
} from './inspect.ts'
export { readSelection, writeSelection, type Selection } from './selection.ts'
export { DEFAULT_PROJECTS_DIR, resolveProjectsRoot } from './root.ts'
export { watchDocuments, type DocumentChanged } from './watch.ts'
export {
  addAssets,
  type AddAssetsInput,
  type AddAssetsResult,
  type AssetFormat,
  type AssetResult,
} from './assets.ts'
