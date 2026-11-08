// The Ruler's scale: part of the Snapping module (pure TS, no Fabric or DOM). Which
// Canvas px a Ruler labels and which get a minor tick follows the zoom, so labels stay
// readable at every zoom.

/** Labels at least this many screen px apart. */
const LABEL_GAP = 50
/** Minor ticks at least this many screen px apart. */
const TICK_GAP = 5
/** Absorbs float error in `step × zoom` (0.1 × 500 is not exactly 50). */
const EPSILON = 1e-9

export type RulerScale = {
  /** Canvas px between labels: the smallest of 1, 2, 5, 10, 20, 50, 100… at least 50 screen px apart. */
  step: number
  /**
   * Canvas px between minor ticks: `step` / 10, / 5 or / 2, the densest at least 5
   * screen px apart and on whole Canvas px; `step` itself when none is.
   */
  minor: number
}

export type RulerTick = { value: number; label: boolean }

export function rulerScale(zoom: number): RulerScale {
  if (!(zoom > 0) || !Number.isFinite(zoom)) throw new Error(`Zoom must be a positive number, got ${zoom}`)
  let step = 1
  for (let decade = 1; ; decade *= 10) {
    const found = [1, 2, 5].map((m) => m * decade).find((s) => s * zoom >= LABEL_GAP - EPSILON)
    if (found !== undefined) {
      step = found
      break
    }
  }
  const minor = [10, 5, 2].map((d) => step / d).find((m) => Number.isInteger(m) && m * zoom >= TICK_GAP - EPSILON) ?? step
  return { step, minor }
}

/** Every minor tick from `from` to `to` (Canvas px, both included), labelled on the multiples of the step. */
export function rulerTicks(from: number, to: number, zoom: number): RulerTick[] {
  const { step, minor } = rulerScale(zoom)
  const every = Math.round(step / minor)
  const ticks: RulerTick[] = []
  // `+ 0` turns a -0 into 0.
  for (let k = Math.ceil(from / minor); k * minor <= to; k++) ticks.push({ value: k * minor + 0, label: k % every === 0 })
  return ticks
}
