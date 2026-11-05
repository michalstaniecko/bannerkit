// Render snapshot harness: compares an encoded image against a committed PNG with pixelmatch.
//
//   await expectImageSnapshot('rect-gradient', png)
//
// Snapshots live in test/__snapshots__/<name>.png and are committed. A missing snapshot fails
// the test; write new ones and refresh existing ones with `pnpm test:update` (sets
// UPDATE_SNAPSHOTS=1), then look at the PNGs before committing. On a mismatch, the actual image and a diff are written to
// test/__snapshots__/__diff__/ (git-ignored) so you can look at them.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import pixelmatch from 'pixelmatch'
import sharp from 'sharp'
import { expect } from 'vitest'
import { exists } from './harness.ts'

export const snapshotDir = join(import.meta.dirname, '__snapshots__')
const diffDir = join(snapshotDir, '__diff__')

export type SnapshotOptions = {
  /** pixelmatch per-pixel colour threshold, 0-1. Default 0.1. */
  threshold?: number
  /** Share of pixels allowed to differ, 0-1. Default 0.001 (0.1%). */
  maxDiffRatio?: number
}

export const updateSnapshots = process.env.UPDATE_SNAPSHOTS === '1'

export async function expectImageSnapshot(name: string, image: Buffer, options: SnapshotOptions = {}): Promise<void> {
  const path = join(snapshotDir, `${name}.png`)
  const actual = await decode(image)

  if (updateSnapshots) {
    await mkdir(snapshotDir, { recursive: true })
    await writeFile(path, await encode(actual))
    return
  }

  if (!(await exists(path))) {
    throw new Error(`missing render snapshot ${path}: run \`pnpm test:update\` and look at the PNG before committing it`)
  }
  const expected = await decode(await readFile(path))
  expect(`${actual.width}×${actual.height}`, `snapshot ${name} size`).toBe(`${expected.width}×${expected.height}`)

  const diff = new Uint8Array(actual.data.length)
  const mismatched = pixelmatch(expected.data, actual.data, diff, actual.width, actual.height, {
    threshold: options.threshold ?? 0.1,
  })
  const ratio = mismatched / (actual.width * actual.height)
  const maxRatio = options.maxDiffRatio ?? 0.001

  const actualPath = join(diffDir, `${name}.actual.png`)
  const diffPath = join(diffDir, `${name}.diff.png`)
  if (ratio > maxRatio) {
    await mkdir(diffDir, { recursive: true })
    await writeFile(actualPath, await encode(actual))
    await writeFile(diffPath, await encode({ ...actual, data: diff }))
  } else {
    await rm(actualPath, { force: true })
    await rm(diffPath, { force: true })
  }
  expect(
    ratio,
    `snapshot ${name}: ${mismatched} pixels differ (see ${diffPath}; run \`pnpm test:update\` if the change is intended)`,
  ).toBeLessThanOrEqual(maxRatio)
}

type Raw = { data: Uint8Array; width: number; height: number }

async function decode(image: Buffer): Promise<Raw> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height }
}

function encode({ data, width, height }: Raw): Promise<Buffer> {
  return sharp(Buffer.from(data), { raw: { width, height, channels: 4 } }).png().toBuffer()
}
