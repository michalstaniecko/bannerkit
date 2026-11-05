# 02: Strict Document schema v1 and `bannerkit validate`

**What to build:** An agent edits a Document by hand and runs `bannerkit validate <project|file>` to get every mistake reported with its JSON path, a message and, for typos, a "did you mean" hint. The full schema v1 from the spec (rect, image and text Layers, Common fields, LinearGradient) is defined in core with zod and frozen, and a generated JSON Schema file gives editors completion while editing.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The zod schema matches the spec's type shape for Document, Common, RectLayer, ImageLayer, TextLayer and LinearGradient, with `version: 1`
- [ ] Unknown keys are errors carrying the JSON path and a "did you mean" suggestion (e.g. `fontWieght` → `fontWeight`)
- [ ] Duplicate Layer ids are errors
- [ ] `autoFit` without `height` is an error
- [ ] A JSON Schema file is generated from zod, and Documents created by the CLI reference it via `$schema`
- [ ] Generated Layer ids are readable `<type>-<n>` (e.g. `text-1`, `image-3`)
- [ ] `bannerkit validate` accepts a Project or a single file, prints path-located errors, supports `--json` and exits non-zero on errors
- [ ] Writes through the ops layer only happen after validation
- [ ] S1 tests cover error paths, hints and cross-field rules
