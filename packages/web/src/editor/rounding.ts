// How edits land in the Document, wherever they come from (a transform on the Canvas,
// a value typed in the Inspector): Box geometry on whole pixels, rotation to 0.1°,
// so the human's edits stay readable in the JSON.

/** `x`, `y`, `width`, `height`: whole Document px. */
export const roundPx = (value: number): number => Math.round(value) || 0

/** `rotation`: 0.1°. */
export const roundAngle = (degrees: number): number => Math.round(degrees * 10) / 10 || 0
