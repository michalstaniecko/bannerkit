import { readdir } from 'node:fs/promises'
import { OpError } from './errors.ts'
import { pathExists } from './fs.ts'
import { documentsDir, projectFile } from './paths.ts'

export async function requireProject(root: string, project: string): Promise<void> {
  if (!(await pathExists(projectFile(root, project)))) {
    throw new OpError('NOT_FOUND', `Project "${project}" not found in ${root}`)
  }
}

/** Document names in a Project, found by listing the documents folder (there is no second list). */
export async function listDocumentFiles(root: string, project: string): Promise<string[]> {
  const entries = await readdir(documentsDir(root, project), { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json') && !e.name.startsWith('.'))
    .map((e) => e.name.slice(0, -'.json'.length))
    .sort()
}
