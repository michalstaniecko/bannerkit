# 11: Editor shows image and text Layers, with line-break parity

**What to build:** The editor displays the full demo banner: images with their Fit, text with the same font and line breaks as the server, and a hatched placeholder for missing Assets. Playwright proves that Fabric's line breaks equal core's and that no fallback font is ever used.

**Blocked by:** 10, 05, 06

**Status:** resolved

- [x] `@font-face` rules are generated from the font manifest using the same TTF files as the server
- [x] Before creating text objects, the editor awaits `document.fonts.load()` for every family/weight the Document uses; after a load it calls `initDimensions()` + `requestRenderAll()`
- [x] Text Layers map to `Textbox` with the font size resolved by core (AutoFit)
- [x] Image Layers load from same-origin Asset URLs, with Fit implemented via scale and a clip path using the core helper
- [ ] A Layer whose Asset is missing shows as a hatched placeholder rect and the Document stays editable
- [x] The S3 Playwright harness (bundled Chromium) is set up via `pnpm test:e2e`
- [x] An S3 test asserts that Fabric `Textbox` line breaks equal core Text Layout across a corpus of strings
- [x] An S3 font-fallback guard fails if `document.fonts.check` is false before text is created, and checks that measuring with the Document's font differs from measuring with an unregistered family

## Comments

- Merged branch `worktree-agent-a5da2523a1cf4093c` into `bannerkit-v1` (fast-forward); `pnpm test`, `pnpm typecheck` and `pnpm test:e2e` pass.
- The REST Document read currently 422s on a missing `src`, so the hatched placeholder only shows for Asset files that fail to load; ticket 12 fixes this (the placeholder box stays unticked until then).
