/**
 * Optimal string alignment distance: Levenshtein plus adjacent transpositions,
 * so `fontWieght` is one edit from `fontWeight`.
 */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1)
      d[i]![j] = best
    }
  }
  return d[a.length]![b.length]!
}

/** The candidate a typo most likely meant, or undefined if nothing is close enough. */
export function closest(input: string, candidates: readonly string[]): string | undefined {
  const lower = input.toLowerCase()
  const limit = Math.max(1, Math.min(3, Math.floor(input.length / 3)))
  let best: { candidate: string; distance: number } | undefined
  for (const candidate of candidates) {
    const distance = candidate.toLowerCase() === lower ? 0 : editDistance(lower, candidate.toLowerCase())
    if (distance <= limit && (best === undefined || distance < best.distance)) best = { candidate, distance }
  }
  return best?.candidate
}
