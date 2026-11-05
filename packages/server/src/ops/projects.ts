import { mkdir, readdir } from 'node:fs/promises'
import { z } from 'zod'
import { OpError, parseInput } from './errors.ts'
import { pathExists, writeJsonAtomic } from './fs.ts'
import { Name, Root, assetsDir, documentsDir, exportsDir, projectDir, projectFile } from './paths.ts'

export const PROJECT_VERSION = 1

const CreateProjectInput = z.object({ root: Root, name: Name })
export type CreateProjectInput = z.input<typeof CreateProjectInput>
export type ProjectRef = { name: string; path: string }

export async function createProject(input: CreateProjectInput): Promise<ProjectRef> {
  const { root, name } = parseInput(CreateProjectInput, input)
  const dir = projectDir(root, name)
  if (await pathExists(dir)) throw new OpError('ALREADY_EXISTS', `Project "${name}" already exists at ${dir}`)

  await Promise.all([
    mkdir(documentsDir(root, name), { recursive: true }),
    mkdir(assetsDir(root, name), { recursive: true }),
    mkdir(exportsDir(root, name), { recursive: true }),
  ])
  await writeJsonAtomic(projectFile(root, name), { version: PROJECT_VERSION, name })
  return { name, path: dir }
}

// listProjects ----------------------------------------------------------------

const ListProjectsInput = z.object({ root: Root })

/** Projects are the folders under the root that hold a `project.json`. A missing root has none. */
export async function listProjects(input: z.input<typeof ListProjectsInput>): Promise<ProjectRef[]> {
  const { root } = parseInput(ListProjectsInput, input)
  if (!(await pathExists(root))) return []
  const entries = await readdir(root, { withFileTypes: true })
  const names = entries.filter((e) => e.isDirectory() && Name.safeParse(e.name).success).map((e) => e.name)
  const projects = await Promise.all(
    names.map(async (name) => ((await pathExists(projectFile(root, name))) ? name : null)),
  )
  return projects
    .filter((name): name is string => name !== null)
    .sort()
    .map((name) => ({ name, path: projectDir(root, name) }))
}
