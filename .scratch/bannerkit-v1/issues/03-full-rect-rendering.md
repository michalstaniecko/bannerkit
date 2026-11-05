# 03: Full rect rendering

**What to build:** A Preview of a Document faithfully shows rect Layers with every visual feature the schema allows: linear gradients, rounded corners, rotation, opacity, shadow, hidden Layers and a transparent Canvas. Gradient and rotation geometry live in core helpers, so the editor can reuse them later.

**Blocked by:** 02

**Status:** resolved

- [x] Linear gradients follow the CSS angle convention (0 = to top, 90 = to right), with geometry computed by a core helper
- [x] `cornerRadius` is applied
- [x] `rotation` is in degrees around the Box centre, with `x`/`y` as the top-left of the unrotated Box
- [x] `opacity` (0–1) and `shadow` (colour, blur, offset) work on any Layer
- [x] Hidden Layers (`visible: false`) are not drawn
- [x] A `null` Canvas background renders transparent in a PNG Preview
- [x] Render snapshot tests compare against committed PNGs with pixelmatch under a tolerance and can be refreshed with an update flag

## Comments

- Merged `worktree-agent-a90ab2ee7a81dd3f0` into `bannerkit-v1` (fast-forward to af9df52); tests and typecheck pass.
