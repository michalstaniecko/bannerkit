# 07: `bannerkit inspect` and Selection file ops

**What to build:** An agent runs `bannerkit inspect` to see what the JSON alone cannot show: each text Layer's resolved font size, line breaks and overflow state, Asset sizes, Layers that fall outside the Canvas, and the editor's current Selection when one is recorded.

**Blocked by:** 05, 06

**Status:** ready-for-agent

- [ ] `inspect` lists Layers with resolved Text Layout (font size, lines, overflow)
- [ ] Overflow warnings and Layers outside the Canvas are reported
- [ ] Asset intrinsic sizes are included for image Layers
- [ ] `readSelection` / `writeSelection` operations read and write the Project's `.state.json` (`{ doc, selectedLayerIds }`), which is git-ignored
- [ ] `inspect` includes the Selection when `.state.json` exists for that Document
- [ ] `--json` output has a stable, tested shape
