# 04: Asset ingest: `bannerkit asset add`

**What to build:** An agent runs `bannerkit asset add <project> <files…>` and gets back each Asset's project-relative `src` and dimensions, ready to reference in a Document. Assets are normalised on ingest, so renderers never have to deal with EXIF rotation, wide-gamut colour or name collisions.

**Blocked by:** 02

**Status:** resolved

- [x] PNG, JPEG, WebP and SVG are accepted; anything else is rejected with a clear error
- [x] Raster Assets are auto-oriented from EXIF and converted to sRGB, with other metadata stripped
- [x] JPEG is re-encoded at q95; PNG and WebP are re-encoded losslessly
- [x] SVG is stored as-is, and its intrinsic size is parsed from `width`/`height`/`viewBox`
- [x] Filenames are sanitised and de-duplicated with a numeric suffix; existing Assets are never overwritten
- [x] The command prints `src` (e.g. `assets/shoe.png`) and dimensions, with a `--json` shape
- [x] Server-side validation reports an image Layer whose `src` does not exist
- [x] S1 tests cover EXIF rotation, a P3 → sRGB fixture, filename collisions and SVG size

## Comments

- Merged `worktree-agent-ae19eecdc5be43891` into `bannerkit-v1` (fast-forward to 680e6b7); tests and typecheck pass.
