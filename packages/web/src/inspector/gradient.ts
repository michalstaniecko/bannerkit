// Changes to a linear gradient made in the Inspector's gradient editor: its angle and
// its stops (colour, offset, added, removed). Each returns the next gradient; the
// stops keep their order in the Document, and there are never fewer than 2.
import type { LinearGradient } from '@bannerkit/core'

/** One change to a gradient, applied to each selected Layer's own gradient. */
export type GradientChange = (gradient: LinearGradient) => LinearGradient

/** A gradient never has fewer stops than this (the Document schema's minimum). */
export const MIN_STOPS = 2

export const setAngle =
  (angle: number): GradientChange =>
  (g) => ({ ...g, angle })

export const setStopColor =
  (index: number, color: string): GradientChange =>
  (g) => ({ ...g, stops: g.stops.map((stop, i) => (i === index ? [color, stop[1]] : stop)) })

export const setStopOffset =
  (index: number, offset: number): GradientChange =>
  (g) => ({ ...g, stops: g.stops.map((stop, i) => (i === index ? [stop[0], offset] : stop)) })

/** Removes stop `index`, unless that would leave fewer than MIN_STOPS. */
export const removeStop =
  (index: number): GradientChange =>
  (g) => (g.stops.length <= MIN_STOPS ? g : { ...g, stops: g.stops.filter((_, i) => i !== index) })

/**
 * Adds a stop in the middle of the widest gap between stops (by offset), with the
 * colour of the stop where the gap starts, placed after it in the list.
 */
export const addStop = (): GradientChange => (g) => {
  const order = g.stops.map((stop, i) => ({ stop, i })).sort((a, b) => a.stop[1] - b.stop[1])
  let at = 0
  for (let k = 1; k < order.length - 1; k++) {
    if (order[k + 1]!.stop[1] - order[k]!.stop[1] > order[at + 1]!.stop[1] - order[at]!.stop[1]) at = k
  }
  const from = order[at]!
  const to = order[at + 1]!
  const offset = Number(((from.stop[1] + to.stop[1]) / 2).toFixed(4))
  const stops = [...g.stops]
  stops.splice(from.i + 1, 0, [from.stop[0], offset])
  return { ...g, stops }
}
