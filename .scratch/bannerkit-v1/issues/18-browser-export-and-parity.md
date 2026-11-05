# 18: Browser Export and browser-vs-server parity

**What to build:** The human Exports from the browser as PNG, JPEG or WebP at 1× or 2×, at exactly the Canvas size whatever the screen's pixel ratio. Playwright proves that browser and server Renders of the same Document differ by less than 1% of pixels, so either path can be trusted.

**Blocked by:** 11, 08, 09

**Status:** ready-for-agent

- [ ] The editor module exposes `export(options)`: an offscreen render at 2 × scale using `toDataURL({ multiplier })` relative to the logical Canvas size (never `devicePixelRatio`), downsampled to the target size and encoded
- [ ] JPEG is flattened onto the Canvas background (white if transparent); PNG keeps alpha
- [ ] Fonts and images are fully loaded before export
- [ ] The top bar has an Export control (format, scale) that downloads the file
- [ ] REST endpoints render one Document and batch-render a Project via the same `render` op as the CLI
- [ ] An S3 test asserts that browser Export vs server Render of `examples/demo` and every Preset differ by less than 1% of pixels at 1×
- [ ] An S3 test asserts exact browser Export dimensions on a 2× device-pixel-ratio context
