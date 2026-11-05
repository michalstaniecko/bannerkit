# 12: Direct manipulation and autosave

**What to build:** The human lays out a banner by hand: select, move, resize and rotate Layers with handles, multi-select, nudge with the arrow keys, and edit text inline by double-clicking. Every change is written back to the Document and autosaved to disk shortly after interaction stops.

**Blocked by:** 11

**Status:** resolved

- [x] On `object:modified`, scale is baked into `width`/`height` and reset to 1, and the centre-based position is converted back to the unrotated top-left (ADR 0001)
- [x] Text Layers hide corner controls: side handles change only `width` and the bottom handle changes `height`; glyphs are never stretched
- [x] Double-clicking a text Layer edits it inline; on edit exit the text is written back
- [x] Multi-select can move Layers together
- [x] Arrow keys nudge by 1px, Shift + arrow by 10px
- [x] The editor emits `change` and `selection` events
- [x] A debounced (500 ms) PUT saves the whole Document through REST, validated and written atomically via the `writeDocument` op
- [x] S2 tests: a lossless Document → Fabric → Document round-trip for every Layer type, including rotation and every Fit; scale applied to `width`/`height` after a simulated resize

## Comments

- Merged branch `worktree-agent-abb1dc72680cc42a0` into `bannerkit-v1` (fast-forward to c6c7467); `pnpm test` (328), `pnpm typecheck` and `pnpm test:e2e` (21) pass. The REST read no longer 422s on a missing `src`, so ticket 11's missing-Asset placeholder box is now ticked.
