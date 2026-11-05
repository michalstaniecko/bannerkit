# 18: Browser Export and browser-vs-server parity

**What to build:** The human Exports from the browser as PNG, JPEG or WebP at 1× or 2×, at exactly the Canvas size whatever the screen's pixel ratio. Playwright proves that browser and server Renders of the same Document differ by less than 1% of pixels, so either path can be trusted.

**Blocked by:** 11, 08, 09

**Status:** ready-for-agent

- [x] The editor module exposes `export(options)`: an offscreen render at 2 × scale using `toDataURL({ multiplier })` relative to the logical Canvas size (never `devicePixelRatio`), downsampled to the target size and encoded
- [x] JPEG is flattened onto the Canvas background (white if transparent); PNG keeps alpha
- [x] Fonts and images are fully loaded before export
- [x] The top bar has an Export control (format, scale) that downloads the file
- [x] REST endpoints render one Document and batch-render a Project via the same `render` op as the CLI
- [x] An S3 test asserts that browser Export vs server Render of `examples/demo` and every Preset differ by less than 1% of pixels at 1×
- [x] An S3 test asserts exact browser Export dimensions on a 2× device-pixel-ratio context

## Comments

- Implemented on `worktree-agent-a11ef489f7b35489d`. Export draws via Fabric `toCanvasElement` (what `toDataURL({ multiplier })` wraps) with the viewport reset to identity, so neither the zoom nor `devicePixelRatio` reaches the output; the browser downsample is `drawImage` with `imageSmoothingQuality: 'high'` (sharp's Lanczos3 on the browser supersample measured worse).
- First parity run: 0.35–3.98% of pixels. There were three root causes, and the threshold is unchanged:
  1. Fabric multiplied shadow blur and offset by the object's scale, which image Layers keep for their Fit. The mapper now sets `Shadow.nonScaling`.
  2. Fabric object caching blits each object from its own cache canvas at a fractional offset, which adds a second resample. Export turns caching off for its draw.
  3. Chrome's default `textRendering` hints and snaps glyphs, so the browser drew about 10% more ink and letter-spaced lines drifted. Text now uses `geometricPrecision`, both in Fabric's `Textbox` (measuring and drawing) and in the browser `measureText`.
- Measured after the fixes (1×, PNG): demo hero 0.001%, rectangle 0.027%, square 0.001%; Preset Documents 1200x628 0.003%, 1080x1080 0.004%, 1080x1920 0.002%, 300x250 0.029%, 728x90 0.087%. To write the images and diffs to a directory for diagnosis, set `BANNERKIT_PARITY_DUMP=<dir>`.
- REST: `POST /api/projects/:p/render` (`{ docs?, sizes?, format?, scale?, quality? }`, answers with `RenderResult`) and `POST /api/projects/:p/documents/:doc/render` (answers with the image bytes). Both call the `render` op and write to `exports/`.
