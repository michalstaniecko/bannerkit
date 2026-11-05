# 05: Image Layers in the server Render

**What to build:** Previews and Renders draw image Layers from Project Assets, filling their Box according to Fit. A Document referencing a missing Asset fails to render with an error that tells the agent exactly which Layer and `src` to fix.

**Blocked by:** 03, 04

**Status:** resolved

- [x] `contain`, `cover` and `stretch` Fit geometry is computed by a core helper (shared with the editor later) and honoured by the server renderer
- [x] Image Layers support rotation, opacity and shadow like other Layers
- [x] SVG Assets are drawn with explicit width and height (never the 300×150 default)
- [x] A failed or missing image load becomes a typed error naming the Layer id and `src`; the CLI exits non-zero
- [x] Snapshot tests cover every Fit, plus an SVG Asset

## Comments

- Merged branch `worktree-agent-a1c7f530d3a667803` into `bannerkit-v1` (fast-forward); tests and typecheck pass. Note: `renderDocument` takes `projectDir` (via `RenderOptions`) rather than the spec's `assetsDir`.
