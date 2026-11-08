# 17: Selection sync

**What to build:** When the human selects Layers in the editor, the Selection is recorded on the server, so an agent running `bannerkit inspect` can act on "make the selected thing bigger".

**Blocked by:** 12, 07

**Status:** resolved

- [x] On selection change, the editor sends `{ doc, selectedLayerIds }` to REST (debounced), and the server writes `.state.json` via `writeSelection`
- [x] A REST endpoint reads the Selection via `readSelection`
- [x] `bannerkit inspect` shows the Layers currently selected in the browser
- [x] An S3 test asserts that the Selection reaches `.state.json`

## Comments

- Merged `worktree-agent-a8cdd35f4f262c7c6` into `bannerkit-v1` (fast-forward to c933d79).
