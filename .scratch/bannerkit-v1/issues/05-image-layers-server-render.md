# 05: Image Layers in the server Render

**What to build:** Previews and Renders draw image Layers from Project Assets, filling their Box according to Fit. A Document referencing a missing Asset fails to render with an error that tells the agent exactly which Layer and `src` to fix.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] `contain`, `cover` and `stretch` Fit geometry is computed by a core helper (shared with the editor later) and honoured by the server renderer
- [ ] Image Layers support rotation, opacity and shadow like other Layers
- [ ] SVG Assets are drawn with explicit width and height (never the 300×150 default)
- [ ] A failed or missing image load becomes a typed error naming the Layer id and `src`; the CLI exits non-zero
- [ ] Snapshot tests cover every Fit, plus an SVG Asset
