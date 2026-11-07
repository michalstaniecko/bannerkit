// Lazy migration: older Document versions are lifted to the current one in
// memory on every read; the file on disk changes only when it is next written
// (or by `bannerkit migrate`). Pure, no DOM or Node APIs.
import { DOCUMENT_VERSION, type Document, type DocumentV1 } from './document.ts'

/**
 * A valid v1 Document as v2. v2 only adds optional fields, so lifting only
 * changes `version`; key order (and so the written JSON) stays the same.
 */
export function liftDocument(document: DocumentV1): Document {
  return { ...document, version: DOCUMENT_VERSION }
}
