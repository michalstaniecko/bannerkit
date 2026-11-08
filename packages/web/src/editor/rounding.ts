// How edits land in the Document, wherever they come from (a transform on the Canvas,
// a value typed in the Inspector, a Canvas resize handle): Box geometry on whole
// pixels, rotation to 0.1°, a Canvas side on a whole pixel within the Canvas limits,
// so the human's edits stay readable in the JSON.
import { MAX_CANVAS_SIDE } from '@bannerkit/core'

/** `x`, `y`, `width`, `height`: whole Document px. */
export const roundPx = (value: number): number => Math.round(value) || 0

/** `rotation`: 0.1°. */
export const roundAngle = (degrees: number): number => Math.round(degrees * 10) / 10 || 0

/** A Canvas `width` or `height`: whole px from 1 to MAX_CANVAS_SIDE. */
export const canvasSide = (value: number): number => Math.min(MAX_CANVAS_SIDE, Math.max(1, roundPx(value)))
