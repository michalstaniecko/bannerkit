# 09: Demo Project and snapshot suite

**What to build:** The repo ships a committed demo Project with three sizes (background, product image, headline, price, logo), and it works as a ready example. The S1 suite is seeded from it, so tests exercise a realistic banner.

**Blocked by:** 05, 06

**Status:** ready-for-agent

- [ ] `examples/demo/` is a committed Project with three Documents at different Presets, using rect, image and text Layers (including AutoFit)
- [ ] `bannerkit validate` and `bannerkit render` succeed on it
- [ ] S1 tests copy it into a temporary projects root
- [ ] Committed Render snapshots of the demo are compared with pixelmatch under a tolerance
