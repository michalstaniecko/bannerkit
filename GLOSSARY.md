# Bannerkit

A local tool for composing fixed-size ad banners from existing product photos, edited by a human in the browser and by AI agents through files and a CLI.

## Language

### Structure

**Project**:
One SKU or campaign: a set of Documents that share Assets and an exports folder.
_Avoid_: workspace, campaign folder, SKU (as a code term)

**Document**:
One banner at one fixed size: a Canvas plus an ordered list of Layers, stored as hand-editable JSON. The Document is the source of truth for every render.
_Avoid_: banner file, design, template, scene

**Canvas**:
The Document's fixed pixel size and background colour.
_Avoid_: artboard, page, stage

**Preset**:
A named standard Canvas size (1200×628, 1080×1080, 1080×1920, 300×250, 728×90) that a new Document can start from.
_Avoid_: format, template

**Layer**:
One visual element of a Document (`rect`, `image` or `text`), positioned by its unrotated box. Its position in the list is its stacking order, from bottom to top.
_Avoid_: object, element, shape, node

**Box**:
A Layer's top-left `x`/`y` plus `width`/`height` before rotation, in Canvas pixels.
_Avoid_: bounds, frame

**Asset**:
An image file stored once in a Project, already normalised on ingest, and referenced by Layers through a project-relative `src`.
_Avoid_: upload, media, resource

### Behaviour

**Fit**:
How an image fills its Box: `contain`, `cover` or `stretch`.

**AutoFit**:
Shrinking a text Layer's font size, from its declared size down to a minimum, until the wrapped text fits its Box.
_Avoid_: auto-size, shrink-to-fit

**Text Layout**:
The resolved line breaks and font size of a text Layer. Both renderers compute it the same way and draw it, never deriving it on their own.

**Selection**:
The Layers currently selected in the browser editor, recorded so an agent can refer to "what's selected".

### Output

**Render**:
Producing pixels from a Document. The browser and the server must produce visually identical Renders of the same Document.

**Export**:
A final encoded Render (PNG, JPEG or WebP) at an exact pixel size and scale, written to the Project's exports folder.
_Avoid_: output, download

**Preview**:
A throwaway Render written so an agent can look at the current state of a Document.

**Supersampling**:
Rendering at twice the target size and downsampling to the target, applied to every Export.
