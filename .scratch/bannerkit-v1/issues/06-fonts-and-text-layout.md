# 06: Fonts and Text Layout with AutoFit, server side

**What to build:** Text Layers render in Previews with wrapping at the Box width and AutoFit, using bundled Inter fonts and a Text Layout computed in core (ADR 0003, ADR 0004). Text that still overflows at its minimum size renders clipped and produces a warning, not a failure.

**Blocked by:** 03

**Status:** resolved

- [x] The official Inter static TTFs (100–900) are bundled under OFL-1.1 and listed in a font manifest (`{ family, weight, style: 'normal', file }`)
- [x] The server registers each manifest file explicitly; text is never measured or drawn with a fallback font
- [x] Validation rejects family/weight pairs that are not in the manifest
- [x] Core `layoutText(layer, measure)` returns `{ fontSize, lines: { text, width, baselineY }[], overflow }`, with `measure` injected by the renderer
- [x] Wrapping is greedy and word-based, splits on spaces, keeps explicit newlines and matches Fabric `Textbox` rules; a single over-long word is never split inside AutoFit (it shrinks the font)
- [x] AutoFit shrinks in 1px steps from `fontSize` to `autoFit.minFontSize` until the wrapped text fits the Box
- [x] Vertical metrics follow line height × font size; `align` and `verticalAlign` are honoured; `letterSpacing` is in px
- [x] The server draws one `fillText` per line at core-computed positions and does not use skia-canvas `textWrap`
- [x] Overflow at the minimum size renders clipped to the Box and is reported as a warning
- [x] A table-driven core test suite covers wrapping edge cases; snapshot tests cover text Renders

## Comments

- Merged branch `worktree-agent-a6ec9482087c63659` into `bannerkit-v1` (b759f17); image and text Layers both render.
