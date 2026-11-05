import { describe, expect, it } from 'vitest'
import { PRESET_IDS, parseSize, resolveSize } from '../src/index.ts'

describe('Presets', () => {
  it('are the five standard Canvas sizes', () => {
    expect(PRESET_IDS).toEqual(['1200x628', '1080x1080', '1080x1920', '300x250', '728x90'])
  })

  it('resolve to their size', () => {
    expect(resolveSize({ preset: '1080x1920' })).toEqual({ width: 1080, height: 1920 })
    expect(resolveSize({ size: { width: 7, height: 9 } })).toEqual({ width: 7, height: 9 })
  })
})

describe('parseSize', () => {
  it.each([
    ['1200x628', { width: 1200, height: 628 }],
    ['300X250', { width: 300, height: 250 }],
    ['728×90', { width: 728, height: 90 }],
    [' 10 x 20 ', { width: 10, height: 20 }],
  ])('parses %j', (text, size) => {
    expect(parseSize(text)).toEqual(size)
  })

  it.each(['', '1200', 'x628', '12.5x10', '-1x10', 'big'])('rejects %j', (text) => {
    expect(parseSize(text)).toBeUndefined()
  })
})
