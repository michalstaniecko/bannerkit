# 17: Selection sync

**What to build:** When the human selects Layers in the editor, the Selection is recorded on the server, so an agent running `bannerkit inspect` can act on "make the selected thing bigger".

**Blocked by:** 12, 07

**Status:** ready-for-agent

- [ ] On selection change, the editor sends `{ doc, selectedLayerIds }` to REST (debounced), and the server writes `.state.json` via `writeSelection`
- [ ] A REST endpoint reads the Selection via `readSelection`
- [ ] `bannerkit inspect` shows the Layers currently selected in the browser
- [ ] An S3 test asserts that the Selection reaches `.state.json`
