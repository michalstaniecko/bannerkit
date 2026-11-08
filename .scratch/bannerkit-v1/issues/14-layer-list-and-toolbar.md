# 14: Layer list and toolbar

**What to build:** The human manages a banner's structure from the UI: a left Layer list to reorder by dragging and to toggle visibility and lock, and a toolbar to add text, rect or image Layers (images uploaded via the file picker), delete and duplicate Layers, create a new Document from a Preset, and duplicate the Document to another size.

**Blocked by:** 13, 04

**Status:** resolved

- [x] The Layer list shows Layers top → bottom by readable id; dragging reorders the stacking order
- [x] Visibility and lock toggles update the Document; locked Layers are not selectable on the Canvas
- [x] The toolbar adds text, rect and image Layers with readable generated ids
- [x] Adding an image opens the file picker and uploads via a multipart REST endpoint backed by the `addAssets` op (same ingest rules as the CLI)
- [x] Delete and duplicate work for single and multi-selections
- [x] The top bar can create a new Document from a Preset and duplicate the current Document to another size, via REST over the existing ops
- [x] Every Layer list action counts as one undo step

## Comments

- Merged branch `worktree-agent-aa516326b32975110` into `bannerkit-v1` (fast-forward); unit, typecheck and e2e all green.
