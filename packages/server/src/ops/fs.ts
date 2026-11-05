import { createHash, randomBytes } from 'node:crypto'
import { link, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/** Writes via a temp file in the same directory, then renames, so readers never see a partial file. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    await writeFile(tmp, data)
    await rename(tmp, path)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

/**
 * Like writeFileAtomic, but never replaces an existing file: the temp file is
 * hard-linked into place, which fails if the name is taken. Returns false then.
 */
export async function writeFileAtomicNew(path: string, data: string | Uint8Array): Promise<boolean> {
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    await writeFile(tmp, data)
    await link(tmp, path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  } finally {
    await rm(tmp, { force: true })
  }
}

/** The bytes every JSON file is written as. */
export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, serializeJson(value))
}

/**
 * The content hash of a file's bytes (sha256, hex). The REST read and save and the
 * live-reload stream all hash the bytes on disk, so equal hashes mean equal files.
 */
export function contentHash(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
