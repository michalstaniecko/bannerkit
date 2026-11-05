export type Size = { width: number; height: number }

/** The largest zoom at which `content` fits inside `viewport`. */
export function fitZoom(content: Size, viewport: Size): number {
  const zoom = Math.min(viewport.width / content.width, viewport.height / content.height)
  return zoom > 0 && Number.isFinite(zoom) ? zoom : 1
}
