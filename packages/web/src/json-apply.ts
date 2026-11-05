// Applies JSON text from the JSON panel to the editor. The text is parsed and
// validated with the core schema; only a valid Document reaches `editor.apply`, as
// one undo step. Anything else comes back as Issues and leaves the Document unchanged.
import { validateDocument, type Issue } from '@bannerkit/core'
import type { Editor } from './editor/index.ts'

export type ApplyJsonResult = { ok: true; errors: [] } | { ok: false; errors: Issue[] }

export async function applyJson(editor: Editor, text: string): Promise<ApplyJsonResult> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `Invalid JSON: ${(e as Error).message}` }] }
  }
  const result = validateDocument(value)
  if (!result.ok) return { ok: false, errors: result.errors }
  await editor.apply(result.document, { cause: 'json' })
  return { ok: true, errors: [] }
}
