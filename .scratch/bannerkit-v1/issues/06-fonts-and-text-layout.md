# 06: Fonts and Text Layout with AutoFit, server side

**What to build:** Text Layers render in Previews with wrapping at the Box width and AutoFit, using bundled Inter fonts and a Text Layout computed in core (ADR 0003, ADR 0004). Text that still overflows at its minimum size renders clipped and produces a warning, not a failure.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The official Inter static TTFs (100–900) are bundled under OFL-1.1 and listed in a font manifest (`{ family, weight, style: 'normal', file }`)
- [ ] The server registers each manifest file explicitly; text is never measured or drawn with a fallback font
- [ ] Validation rejects family/weight pairs that are not in the manifest
- [ ] Core `layoutText(layer, measure)` returns `{ fontSize, lines: { text, width, baselineY }[], overflow }`, with `measure` injected by the renderer
- [ ] Wrapping is greedy and word-based, splits on spaces, keeps explicit newlines and matches Fabric `Textbox` rules; a single over-long word is never split inside AutoFit (it shrinks the font)
- [ ] AutoFit shrinks in 1px steps from `fontSize` to `autoFit.minFontSize` until the wrapped text fits the Box
- [ ] Vertical metrics follow line height × font size; `align` and `verticalAlign` are honoured; `letterSpacing` is in px
- [ ] The server draws one `fillText` per line at core-computed positions and does not use skia-canvas `textWrap`
- [ ] Overflow at the minimum size renders clipped to the Box and is reported as a warning
- [ ] A table-driven core test suite covers wrapping edge cases; snapshot tests cover text Renders
