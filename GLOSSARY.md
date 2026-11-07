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
One visual element of a Document (`rect`, `image`, `text` or `group`), positioned by its unrotated box. Its position in the list is its stacking order, from bottom to top.
_Avoid_: object, element, shape, node

**Group**:
A Layer that holds an ordered list of child Layers and is selected, moved and hidden as one unit. It has no position of its own: its Box is the bounds of its children, which keep Canvas coordinates.
_Avoid_: folder, container, frame

**Box**:
A Layer's top-left `x`/`y` plus `width`/`height` before rotation, in Canvas pixels.
_Avoid_: bounds, frame

**Guide**:
A horizontal or vertical line at a fixed Canvas coordinate, stored in the Document for layout and Snapping and never drawn in a Render.
_Avoid_: ruler line, safe line

**Asset**:
An image file stored once in a Project, already normalised on ingest, and referenced by Layers through a project-relative `src`.
_Avoid_: upload, media, resource

### Behaviour

**Anchor**:
The point of the Canvas (one of nine) that stays put when the Canvas is resized; Layers keep their pixel offsets from it and are never scaled.

**Align**:
Moving Layers so one of their edges or centres lines up with the same edge or centre of the others or of the Canvas.

**Distribute**:
Moving Layers once so the spaces between neighbours along one axis are equal, or equal to a given gap. Nothing is stored, so later changes do not re-space them.

**Snapping**:
Pulling a Layer being moved or resized onto a nearby edge, centre or guide of another Layer or the Canvas, or onto an equal spacing. Only the editor snaps; nothing about it is stored.
_Avoid_: sticking, magnet

**Fit**:
How an image fills its Box: `contain`, `cover` or `stretch`.

**AutoFit**:
Shrinking a text Layer's font size, from its declared size down to a minimum, until the wrapped text fits its Box.
_Avoid_: auto-size, shrink-to-fit

**Text Layout**:
The resolved line breaks and font size of a text Layer. Both renderers compute it the same way and draw it, never deriving it on their own.

**Inspector**:
The editor panel showing and editing the properties of the Selection, or of the Document when nothing is selected.
_Avoid_: properties panel, sidebar

**Selection**:
The Layers currently selected in the browser editor, recorded so an agent can refer to "what's selected".

**Selection Box**:
The axis-aligned union of the rotated extents (`boxExtent`) of the Layers in the Selection. With several Layers selected, the Inspector's `x`/`y` are its top-left, and typing one moves every Layer by the same delta; its size is shown but not editable.
_Avoid_: bounding box, group box

**Mixed**:
What the Inspector shows for a property whose value differs between the selected Layers: an empty field or an indeterminate switch. Setting a value there gives it to all of them.
_Avoid_: multiple values, varies

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
