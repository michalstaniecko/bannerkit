import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FONTS_DIR, fontManifest, measureText, requireFont } from '../src/render/fonts.ts'

// Inter 4.1 static TTFs ("Version 4.001;git-9221beed3"), from the release zip
// (github.com/rsms/inter/releases/tag/v4.1, extras/ttf).
const INTER_SHA256: Record<string, string> = {
  '100/normal': '22453f995345e5618d539315a8501f4c74ca41d1898ce44e7d1b8206f0d097d4',
  '200/normal': 'f3c7079d9eb4a799251a844acea9eb55f99094479306e2ac1bee875dd9f7ae80',
  '300/normal': '164414f0aacbe98a7e64addc43f7b3bfd2e32f7b90e101feeab227f14c371bda',
  '400/normal': '40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82',
  '500/normal': '97ad806f526e41546d46365bb3a393145f75b7b1568913db74549ad8b8dba872',
  '600/normal': '78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3',
  '700/normal': '288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f',
  '800/normal': 'e6756ad5690b77606aa62249a7b420d9902d45cae4b0048a24911fd4324b0a22',
  '900/normal': '6342d3ea6dc088b43867f615e807d898adf100c93edb978b8e52c5eb71a264da',
  '100/italic': 'd89ffb2849ef91246283de40a929f671b6e0c8ad1c235701f9362fb0406b4cce',
  '200/italic': '22fca887d9a9336e8a29601b19683947a57b53911c74e251c3657ee798635275',
  '300/italic': 'c3f9efa776957eefaeac8a2991a990fd1bba6cb928dbaeab7abd0655f3a7693c',
  '400/italic': 'bbc051dd204b5019a1aa0bc0ae2aa8a05ab13e7a3f979fa357631dc7feb6833a',
  '500/italic': '51c2c8d7c36f7c26e6e2678b5c3069b329bde9a081154553b0f5bc2d4fc14075',
  '600/italic': 'eff2930c3d3b35d3fcf5f76252b6baef4c3e907d9d2fde1d16cf5d417f8deef4',
  '700/italic': '948405a16cdc62701da5f4005ed068ca5f4d27061d98f7974ccfc37831d9581d',
  '800/italic': '31b58a00cb9e8d00cb936057285282310e81d2f834461264c543c96983af64a6',
  '900/italic': '1737f7d5b391520e9adcc3ea8c730a0854fe6fdd9b9c93c4100c89beb215a931',
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

describe('bundled fonts', () => {
  it('lists the official Inter static TTFs 100-900, upright and italic, in the manifest', async () => {
    const manifest = fontManifest()
    expect(manifest.map((f) => [f.family, f.weight, f.style])).toEqual([
      ...WEIGHTS.map((w) => ['Inter', w, 'normal']),
      ...WEIGHTS.map((w) => ['Inter', w, 'italic']),
    ])
    for (const face of manifest) {
      const sha = createHash('sha256').update(await readFile(join(FONTS_DIR, face.file))).digest('hex')
      expect(sha, face.file).toBe(INTER_SHA256[`${face.weight}/${face.style}`])
    }
    expect(await readFile(join(FONTS_DIR, 'OFL.txt'), 'utf8')).toContain('SIL Open Font License, Version 1.1')
  })

  it('measures with the registered Inter files', () => {
    // skia-canvas metrics of Inter 4.1 static (bannerkit-notes/inter-fonts.md).
    expect(measureText({ family: 'Inter', weight: 400, style: 'normal', size: 40 }, 'Hello', 0)).toBeCloseTo(96.40625, 4)
    expect(measureText({ family: 'Inter', weight: 700, style: 'normal', size: 40 }, 'Hello', 0)).toBeCloseTo(99.921875, 4)
    expect(measureText({ family: 'Inter', weight: 400, style: 'normal', size: 40 }, ' ', 0)).toBeCloseTo(11.25, 4)
  })

  it('measures italic text with the italic file, not a slanted upright', () => {
    const upright = measureText({ family: 'Inter', weight: 400, style: 'normal', size: 40 }, 'Hello', 0)
    const italic = measureText({ family: 'Inter', weight: 400, style: 'italic', size: 40 }, 'Hello', 0)
    expect(italic).not.toBeCloseTo(upright, 2)
  })

  it('adds letterSpacing after every glyph, the last included', () => {
    const plain = measureText({ family: 'Inter', weight: 400, style: 'normal', size: 40 }, 'Hello', 0)
    expect(measureText({ family: 'Inter', weight: 400, style: 'normal', size: 40 }, 'Hello', 4)).toBeCloseTo(plain + 20, 4)
  })

  it('refuses to measure or draw with a font the manifest does not register, instead of falling back', () => {
    // Helvetica is a system font skia-canvas would silently use; it is not ours.
    expect(() => requireFont('Helvetica', 400, 'normal')).toThrow(/not registered/)
    expect(() => measureText({ family: 'NoSuchFont', weight: 400, style: 'normal', size: 40 }, 'Hello', 0)).toThrow(/not registered/)
    expect(() => requireFont('Inter', 900, 'normal')).not.toThrow()
    expect(() => requireFont('Inter', 900, 'italic')).not.toThrow()
  })
})
