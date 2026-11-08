import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { expectImageSnapshot, snapshotDir, updateSnapshots } from './snapshot.ts'

// Uses a committed render snapshot as its baseline; skipped while snapshots are being rewritten.
describe.skipIf(updateSnapshots)('expectImageSnapshot', () => {
  const baseline = () => readFile(join(snapshotDir, 'rect-opacity.png'))

  it('passes for an identical image', async () => {
    await expectImageSnapshot('rect-opacity', await baseline())
  })

  it('tolerates a few differing pixels under maxDiffRatio', async () => {
    // 200×100 = 20 000 pixels; 4 changed is 0.02%, under the 0.1% default.
    const img = await sharp(await baseline())
      .composite([{ input: { create: { width: 2, height: 2, channels: 4, background: '#ff0000' } }, left: 0, top: 0 }])
      .png()
      .toBuffer()
    await expectImageSnapshot('rect-opacity', img)
  })

  it('fails when the image differs beyond tolerance, or differs in size', async () => {
    const red = (w: number, h: number) =>
      sharp({ create: { width: w, height: h, channels: 4, background: '#ff0000' } }).png().toBuffer()
    await expect(expectImageSnapshot('rect-opacity', await red(200, 100))).rejects.toThrow(/pixels differ/)
    await expect(expectImageSnapshot('rect-opacity', await red(100, 100))).rejects.toThrow(/size/)
  })

  it('fails for a missing snapshot instead of silently recording it', async () => {
    await expect(expectImageSnapshot('no-such-snapshot', await baseline())).rejects.toThrow(/missing render snapshot/)
  })
})
