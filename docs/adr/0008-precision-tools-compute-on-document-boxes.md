# Precision tools compute on Document Boxes and draw outside the Render; no snapping library

Snapping, Measurement, Align and Distribute compute on the extents of Layers as the Document defines them (core `layerExtent`: a leaf's rotated Box, a text Layer without `height` taking its Text Layout height, a Group's the union of its children), never on the outlines of Fabric objects (`getCoords`, bounding rects). The two differ: an image with `contain` fit has its handles on the drawn image, not on its Box, and a Textbox grows wider than its Box when a word does not fit. Snapping to Fabric outlines would line up something other than the `x`/`y`/`width`/`height` written in the JSON.

The geometry is our own pure TypeScript with no Fabric or DOM imports: Snapping and Measurement in a module of the web editor (only the editor uses them), Align and Distribute in core, because agents need them in the CLI (ADR 0005) and both must give the same result. A thin adapter hooks the Snapping module into Fabric's transform events, so Fabric still owns dragging, handles, `ActiveSelection` and rotation, and one gesture still ends in one `change`.

Guides, snap lines, equal-spacing marks and Measurement are drawn by the editor on Fabric's top context (`contextTop`), in screen pixels. Export draws with `toCanvasElement`, which never touches that context, so none of them can reach an Export, and the server Render ignores `guides`. Rulers are separate `<canvas>` elements beside the Canvas.

## Considered Options

- **`AligningGuidelines` from `fabric/extensions`.** Rejected: it snaps on Fabric outlines, knows nothing of Guides, equal spacing or the zoom-dependent threshold, and clashes with the text Layers' custom `resizing` handles. Its drawing pattern (clear on `before:render`, draw on `after:render` on `contextTop`) is reused.
- **Moveable / Selecto / @scena (`react-ruler`, `guides`).** Rejected: they drag DOM elements, while every Layer here lives inside one `<canvas>`, so they would compete with Fabric for the pointer. The @scena packages are also unmaintained since 2023.
- **Replacing Fabric with Konva, tldraw or Excalidraw** to get snapping built in. Rejected: a rewrite of the editor and of the render-parity work (ADR 0002, ADR 0004) for features that are a few hundred lines of geometry. The comparison is in `.scratch/editor-guides-snapping/research.md`.

## Consequences

- Anything new that measures Layers in the editor (a grid, auto layout handles) should go through `layerExtent` and the Selection Box from core, not through Fabric objects.
- The browser and the CLI share one Align and Distribute implementation, so the editor applies them locally through core and saves by autosave; there is no REST endpoint for them.
