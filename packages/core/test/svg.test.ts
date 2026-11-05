import { describe, expect, it } from 'vitest'
import { svgIntrinsicSize } from '../src/index.ts'

const svg = (attrs: string) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect/></svg>`

describe('svgIntrinsicSize', () => {
  it.each([
    ['width and height in px', svg('width="300px" height="150"'), { width: 300, height: 150 }],
    ['width and height win over viewBox', svg('width="64" height="32" viewBox="0 0 10 10"'), { width: 64, height: 32 }],
    ['viewBox alone', svg('viewBox="0 0 120.5 40"'), { width: 120.5, height: 40 }],
    ['comma-separated viewBox', svg("viewBox='-5,-5,20,10'"), { width: 20, height: 10 }],
    ['width plus viewBox keeps the aspect ratio', svg('width="60" viewBox="0 0 120 40"'), { width: 60, height: 20 }],
    ['height plus viewBox keeps the aspect ratio', svg('height="80" viewBox="0 0 120 40"'), { width: 240, height: 80 }],
    ['absolute units at 96 dpi', svg('width="1in" height="72pt"'), { width: 96, height: 96 }],
    ['percentages fall back to viewBox', svg('width="100%" height="100%" viewBox="0 0 50 25"'), { width: 50, height: 25 }],
    [
      'a prolog, comments and a doctype before the root',
      `<?xml version="1.0"?><!-- <svg width="1" height="1"> --><!DOCTYPE svg>${svg('width="10" height="20"')}`,
      { width: 10, height: 20 },
    ],
    ['attributes on several lines', '<svg\n  width="7"\n  height="9"\n/>', { width: 7, height: 9 }],
    ['a namespaced root', '<svg:svg xmlns:svg="http://www.w3.org/2000/svg" width="5" height="6"/>', { width: 5, height: 6 }],
  ])('%s', (_, text, expected) => {
    expect(svgIntrinsicSize(text)).toEqual(expected)
  })

  it.each([
    ['no size at all', svg('')],
    ['percentages only', svg('width="100%" height="50%"')],
    ['a degenerate viewBox', svg('viewBox="0 0 0 10"')],
    ['not an SVG', '<html><body/></html>'],
  ])('returns undefined for %s', (_, text) => {
    expect(svgIntrinsicSize(text)).toBeUndefined()
  })
})
