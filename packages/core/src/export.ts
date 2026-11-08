// Export conventions shared by the server's render and the editor's browser Export
// (ADR 0006), so both name, encode and size an Export the same way.
import { formatSize, type Size } from './presets.ts'

export const EXPORT_FORMATS = ['png', 'jpg', 'webp'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const EXPORT_SCALES = [1, 2] as const
/** Output scale relative to the Canvas size. */
export type ExportScale = (typeof EXPORT_SCALES)[number]

/** JPEG/WebP quality (1-100) when none is given. PNG is always lossless. */
export const DEFAULT_EXPORT_QUALITY = 90

/** Every Export is drawn at SUPERSAMPLE × scale and downsampled to its size (Supersampling). */
export const SUPERSAMPLE = 2

export const EXPORT_MIME: Record<ExportFormat, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

export const isExportFormat = (value: unknown): value is ExportFormat => (EXPORT_FORMATS as readonly unknown[]).includes(value)
export const isExportScale = (value: unknown): value is ExportScale => (EXPORT_SCALES as readonly unknown[]).includes(value)

/** `<doc>.<w>x<h>[@2x].<ext>`, where w×h is the Canvas size. */
export const exportFileName = (name: string, canvas: Size, scale: ExportScale, format: ExportFormat) =>
  `${name}.${formatSize(canvas)}${scale === 1 ? '' : `@${scale}x`}.${format}`
