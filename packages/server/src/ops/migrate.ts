import { DOCUMENT_VERSION, type Issue } from '@bannerkit/core'
import { z } from 'zod'
import { OpError, parseInput } from './errors.ts'
import { serializeJson, writeFileAtomic } from './fs.ts'
import { Name, Root, documentFile, projectDir } from './paths.ts'
import { listDocumentFiles, requireProject } from './store.ts'
import { checkDocument, readJsonFile } from './validation.ts'

const MigrateInput = z.object({ root: Root, project: Name })

export type MigratedDocument = { name: string; path: string }
export type MigrateResult = {
  project: string
  /** Rewritten as the current version. */
  migrated: MigratedDocument[]
  /** Already the current version; not written. */
  unchanged: MigratedDocument[]
  /** Not valid Documents (the errors `validate` reports); not written. */
  invalid: (MigratedDocument & { errors: Issue[] })[]
}

/**
 * Rewrites every valid older-version Document in a Project as the current
 * version. Reading already lifts them in memory (validateDocument), so this
 * only makes the files say so: the content is the same, only `version`
 * changes and the JSON is formatted as by any other write. Invalid Documents
 * are reported and never written. Idempotent.
 */
export async function migrate(input: z.input<typeof MigrateInput>): Promise<MigrateResult> {
  const { root, project } = parseInput(MigrateInput, input)
  await requireProject(root, project)
  const result: MigrateResult = { project, migrated: [], unchanged: [], invalid: [] }
  for (const name of await listDocumentFiles(root, project)) {
    const path = documentFile(root, project, name)
    let json: unknown
    try {
      json = await readJsonFile(path, `Document "${name}" not found in Project "${project}"`)
    } catch (error) {
      if (!(error instanceof OpError) || error.code !== 'INVALID_DOCUMENT') throw error
      result.invalid.push({ name, path, errors: [{ path: '', message: error.message }] })
      continue
    }
    const checked = await checkDocument(json, { projectDir: projectDir(root, project) })
    if (!checked.ok) {
      result.invalid.push({ name, path, errors: checked.errors })
    } else if ((json as { version?: unknown }).version === DOCUMENT_VERSION) {
      result.unchanged.push({ name, path })
    } else {
      await writeFileAtomic(path, serializeJson(checked.document))
      result.migrated.push({ name, path })
    }
  }
  return result
}
