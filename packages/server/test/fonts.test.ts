import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FONTS_DIR, fontManifest, measureText, requireFont } from '../src/render/fonts.ts'

// Inter 4.1 static TTFs, from the release zip (bannerkit-notes/inter-fonts.md).
const INTER_SHA256: Record<number, string> = {
  100: '22453f995345e5618d539315a8501f4c74ca41d1898ce44e7d1b8206f0d097d4',
  200: 'f3c7079d9eb4a799251a844acea9eb55f99094479306e2ac1bee875dd9f7ae80',
  300: '164414f0aacbe98a7e64addc43f7b3bfd2e32f7b90e101feeab227f14c371bda',
  400: '40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82',
  500: '97ad806f526e41546d46365bb3a393145f75b7b1568913db74549ad8b8dba872',
  600: '78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3',
  700: '288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f',
  800: 'e6756ad5690b77606aa62249a7b420d9902d45cae4b0048a24911fd4324b0a22',
  900: '6342d3ea6dc088b43867f615e807d898adf100c93edb978b8e52c5eb71a264da',
}

describe('bundled fonts', () => {
  it('lists the official Inter static TTFs 100-900 in the manifest', async () => {
    const manifest = fontManifest()
    expect(manifest.map((f) => [f.family, f.weight, f.style])).toEqual(
      [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ['Inter', w, 'normal']),
    )
    for (const face of manifest) {
      const sha = createHash('sha256').update(await readFile(join(FONTS_DIR, face.file))).digest('hex')
      expect(sha, face.file).toBe(INTER_SHA256[face.weight])
    }
    expect(await readFile(join(FONTS_DIR, 'OFL.txt'), 'utf8')).toContain('SIL Open Font License, Version 1.1')
  })

  it('measures with the registered Inter files', () => {
    // skia-canvas metrics of Inter 4.1 static (bannerkit-notes/inter-fonts.md).
    expect(measureText({ family: 'Inter', weight: 400, size: 40 }, 'Hello', 0)).toBeCloseTo(96.40625, 4)
    expect(measureText({ family: 'Inter', weight: 700, size: 40 }, 'Hello', 0)).toBeCloseTo(99.921875, 4)
    expect(measureText({ family: 'Inter', weight: 400, size: 40 }, ' ', 0)).toBeCloseTo(11.25, 4)
  })

  it('adds letterSpacing after every glyph, the last included', () => {
    const plain = measureText({ family: 'Inter', weight: 400, size: 40 }, 'Hello', 0)
    expect(measureText({ family: 'Inter', weight: 400, size: 40 }, 'Hello', 4)).toBeCloseTo(plain + 20, 4)
  })

  it('refuses to measure or draw with a font the manifest does not register, instead of falling back', () => {
    // Helvetica is a system font skia-canvas would silently use; it is not ours.
    expect(() => requireFont('Helvetica', 400)).toThrow(/not registered/)
    expect(() => measureText({ family: 'NoSuchFont', weight: 400, size: 40 }, 'Hello', 0)).toThrow(/not registered/)
    expect(() => requireFont('Inter', 900)).not.toThrow()
  })
})
