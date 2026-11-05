// Writes the generated Document JSON Schema to schema/document.schema.json.
// Run with `pnpm schema` after any schema change; a core test fails while the file is stale.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DOCUMENT_SCHEMA_FILE, documentJsonSchema } from '../src/index.ts'

const path = join(import.meta.dirname, '..', DOCUMENT_SCHEMA_FILE)
await mkdir(dirname(path), { recursive: true })
await writeFile(path, `${JSON.stringify(documentJsonSchema(), null, 2)}\n`)
console.log(`wrote ${path}`)
