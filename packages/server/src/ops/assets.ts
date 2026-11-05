import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { svgIntrinsicSize } from '@bannerkit/core'
import sharp, { type Sharp } from 'sharp'
import { z } from 'zod'
import { OpError, parseInput } from './errors.ts'
import { writeFileAtomicNew } from './fs.ts'
import { Name, Root, assetsDir } from './paths.ts'
import { requireProject } from './store.ts'

// addAssets: normalises image files on ingest so renderers never deal with EXIF
// rotation, wide-gamut colour or name collisions. Takes buffers plus filenames
// (a REST multipart upload) or paths (the CLI), which it reads itself.

const AssetFile = z.union([
  z.object({ filename: z.string().min(1), data: z.custom<Uint8Array>((v) => v instanceof Uint8Array, 'expected file bytes') }),
  z.object({ path: z.string().min(1) }),
])

const AddAssetsInput = z.object({ root: Root, project: Name, files: z.array(AssetFile).min(1) })
export type AddAssetsInput = z.input<typeof AddAssetsInput>

export type AssetFormat = 'png' | 'jpeg' | 'webp' | 'svg'
export type AssetResult = { src: string; path: string; format: AssetFormat; width: number; height: number }
export type AddAssetsResult = { project: string; assets: AssetResult[] }

const EXPECTED = '(expected PNG, JPEG, WebP or SVG)'

type Normalised = { filename: string; data: Buffer; format: AssetFormat; width: number; height: number }

/**
 * Normalises every file first and writes only when the whole batch is
 * acceptable, so a bad file never leaves half a batch behind.
 */
export async function addAssets(input: AddAssetsInput): Promise<AddAssetsResult> {
  const { root, project, files } = parseInput(AddAssetsInput, input)
  await requireProject(root, project)
  const normalised: Normalised[] = []
  for (const file of files) {
    const { filename, data } = 'path' in file ? await readSource(file.path) : file
    normalised.push(await normalise(filename, Buffer.from(data)))
  }

  const assets: AssetResult[] = []
  for (const { filename, data, ...size } of normalised) {
    const stem = sanitiseStem(filename)
    const ext = EXTENSIONS[size.format]
    for (let n = 0; ; n++) {
      const name = `${n === 0 ? stem : `${stem}-${n}`}.${ext}`
      const path = join(assetsDir(root, project), name)
      if (await writeFileAtomicNew(path, data)) {
        assets.push({ src: `assets/${name}`, path, ...size })
        break
      }
    }
  }
  return { project, assets }
}

async function readSource(path: string): Promise<{ filename: string; data: Buffer }> {
  try {
    return { filename: basename(path), data: await readFile(path) }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'EISDIR') throw new OpError('NOT_FOUND', `File ${path} not found`)
    throw error
  }
}

const EXTENSIONS: Record<AssetFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', svg: 'svg' }

/**
 * A safe, lower-case file stem: no directories, no extension, ASCII letters,
 * digits, "_" and "-" only. Lower case keeps names distinct on
 * case-insensitive filesystems.
 */
export function sanitiseStem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80)
    .replace(/[-_]+$/, '')
  return stem || 'asset'
}

/** An XML document whose root element is `<svg>` (after any prolog, comments and doctype). */
const SVG_START = /^﻿?\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<(?:[\w.-]+:)?svg[\s>/]/i

async function normalise(filename: string, input: Buffer): Promise<Normalised> {
  const text = input.subarray(0, 64 * 1024).toString('utf8')
  if (SVG_START.test(text)) {
    // SVG is stored as-is; renderers need only its intrinsic size.
    const size = svgIntrinsicSize(input.toString('utf8'))
    if (!size) {
      throw new OpError(
        'UNSUPPORTED_ASSET',
        `${filename}: SVG has no intrinsic size; give the <svg> element width and height or a viewBox`,
      )
    }
    return { filename, data: input, format: 'svg', ...size }
  }

  let format: string | undefined
  try {
    format = (await sharp(input).metadata()).format
  } catch {
    throw new OpError('UNSUPPORTED_ASSET', `${filename}: not a readable image ${EXPECTED}`)
  }
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') {
    throw new OpError('UNSUPPORTED_ASSET', `${filename}: unsupported image format "${format}" ${EXPECTED}`)
  }
  const { data, info } = await encode(sharp(input).autoOrient().toColourspace('srgb'), format).toBuffer({
    resolveWithObject: true,
  })
  return { filename, data, format, width: info.width, height: info.height }
}

/** Metadata (EXIF, XMP, ICC) is dropped by sharp unless asked to keep it. */
function encode(image: Sharp, format: AssetFormat): Sharp {
  if (format === 'jpeg') return image.jpeg({ quality: 95 })
  if (format === 'webp') return image.webp({ lossless: true })
  // Plain png() is lossless; palette, quality or effort would quantise.
  return image.png()
}
