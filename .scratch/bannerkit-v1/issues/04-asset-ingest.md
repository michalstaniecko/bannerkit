# 04: Asset ingest: `bannerkit asset add`

**What to build:** An agent runs `bannerkit asset add <project> <files…>` and gets back each Asset's project-relative `src` and dimensions, ready to reference in a Document. Assets are normalised on ingest, so renderers never have to deal with EXIF rotation, wide-gamut colour or name collisions.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] PNG, JPEG, WebP and SVG are accepted; anything else is rejected with a clear error
- [ ] Raster Assets are auto-oriented from EXIF and converted to sRGB, with other metadata stripped
- [ ] JPEG is re-encoded at q95; PNG and WebP are re-encoded losslessly
- [ ] SVG is stored as-is, and its intrinsic size is parsed from `width`/`height`/`viewBox`
- [ ] Filenames are sanitised and de-duplicated with a numeric suffix; existing Assets are never overwritten
- [ ] The command prints `src` (e.g. `assets/shoe.png`) and dimensions, with a `--json` shape
- [ ] Server-side validation reports an image Layer whose `src` does not exist
- [ ] S1 tests cover EXIF rotation, a P3 → sRGB fixture, filename collisions and SVG size
