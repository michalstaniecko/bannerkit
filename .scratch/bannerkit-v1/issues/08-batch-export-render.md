# 08: Batch Export: `bannerkit render`

**What to build:** An agent runs `bannerkit render <project>` to Export every Document in a Project, or a subset filtered by document name or size, in any supported format and scale, with exact pixel dimensions and predictable file names.

**Blocked by:** 03

**Status:** resolved

- [x] `render <project> [--doc …] [--size WxH …] [--format png|jpg|webp] [--scale 1|2] [--quality N]`, defaulting to PNG, scale 1, quality 90
- [x] Exports are written to the Project's exports folder as `<doc>.<w>x<h>[@2x].<ext>`
- [x] Every Export is supersampled at 2 × scale and downsampled with Lanczos to exactly `width × height × scale`
- [x] JPEG is flattened onto the Canvas background (white if transparent); PNG keeps alpha; WebP is encoded via sharp
- [x] S1 tests assert exact dimensions for every Preset at 1× and 2×, JPEG flattening and PNG alpha
- [x] `--json` lists the written files

## Comments

- Merged branch `worktree-agent-af794e7f93f7a15e4` into `bannerkit-v1` (fast-forward); tests and typecheck pass.
