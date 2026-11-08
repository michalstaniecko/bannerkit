import { describe, expect, it } from 'vitest'
import { fitImage } from '../src/index.ts'

// Worked by hand: a 200×100 image into a 100×100 Box, and a 100×200 image into a 200×100 Box.
describe('fitImage', () => {
  it('contain: shows the whole image, letterboxed and centred in the Box', () => {
    expect(fitImage('contain', { width: 100, height: 100 }, { width: 200, height: 100 })).toEqual({
      source: { x: 0, y: 0, width: 200, height: 100 },
      dest: { x: 0, y: 25, width: 100, height: 50 },
    })
    expect(fitImage('contain', { width: 200, height: 100 }, { width: 100, height: 200 })).toEqual({
      source: { x: 0, y: 0, width: 100, height: 200 },
      dest: { x: 75, y: 0, width: 50, height: 100 },
    })
  })

  it('cover: fills the Box, cropping the centre of the image', () => {
    expect(fitImage('cover', { width: 100, height: 100 }, { width: 200, height: 100 })).toEqual({
      source: { x: 50, y: 0, width: 100, height: 100 },
      dest: { x: 0, y: 0, width: 100, height: 100 },
    })
    expect(fitImage('cover', { width: 200, height: 100 }, { width: 100, height: 200 })).toEqual({
      source: { x: 0, y: 75, width: 100, height: 50 },
      dest: { x: 0, y: 0, width: 200, height: 100 },
    })
  })

  it('stretch: maps the whole image onto the whole Box', () => {
    expect(fitImage('stretch', { width: 100, height: 100 }, { width: 200, height: 100 })).toEqual({
      source: { x: 0, y: 0, width: 200, height: 100 },
      dest: { x: 0, y: 0, width: 100, height: 100 },
    })
  })

  it('draws nothing for an empty Box or image', () => {
    for (const fit of ['contain', 'cover', 'stretch'] as const) {
      expect(fitImage(fit, { width: 0, height: 100 }, { width: 200, height: 100 }).dest.width).toBe(0)
      expect(fitImage(fit, { width: 100, height: 100 }, { width: 0, height: 0 }).dest).toEqual({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      })
    }
  })
})
