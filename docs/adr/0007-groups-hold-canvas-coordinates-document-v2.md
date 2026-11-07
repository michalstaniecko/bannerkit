# Groups have no transform of their own; Document v2 is a superset of v1

Document v2 adds a `group` Layer that holds an ordered list of child Layers, nested to any depth. A Group has no `x`/`y`/`width`/`height`/`rotation`. Its children keep absolute Canvas coordinates, so a Layer's `x`/`y` means the same thing whether or not it is grouped, and an agent can read or edit any Layer without walking up the tree. The Group's Box is derived from its children. Moving, resizing or rotating a Group in the editor rewrites the children's own fields, in one undo step. A Group carries only `id`, `name`, `visible`, `locked` and `opacity`. Its opacity is composited the CSS way: the children are drawn to one surface first, and opacity applies to that surface. It is not multiplied into each child. Both renderers must do the same.

v2 only adds fields (`group`, `textTransform`, `fontStyle`, `guides`), so migrating v1 just means bumping `version`. Core reads both versions and lifts v1 to v2 in memory. A file is written as v2 only when a change to it is saved, so opening a v1 file never rewrites it on disk or triggers live reload. `bannerkit migrate` upgrades a whole Project in one go.

## Considered Options

- **Group with its own transform, children relative to it** (as in Fabric `Group` or SVG `<g transform>`). Rejected: every child's `x`/`y` would depend on its ancestors, JSON would be harder for agents to edit by hand, and every renderer and Snapping calculation would need matrix composition.
- **No persistent Group, Align and Distribute on the Selection only.** Rejected: the user wants to move and hide named sets of Layers as one unit.

## Consequences

- A persistent Group layout (auto layout: `direction`, `gap`, `padding`) is deliberately left out. If it comes later, it will be an optional `layout` field on the Group and will need its own ADR, because the children's positions along that axis would stop being the source of truth.
