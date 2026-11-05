// The top bar's Export control: format and scale pickers and a button that saves
// the editor's browser Export to a file, named like the server's (`<doc>.<w>x<h>[@2x].<ext>`).
import { useState, type RefObject } from 'react'
import { EXPORT_FORMATS, EXPORT_SCALES, exportFileName, type ExportFormat, type ExportScale } from '@bannerkit/core'
import type { Editor } from './editor/index.ts'

type Props = {
  editor: RefObject<Editor | null>
  /** The Document's name, used for the file name. */
  name: string
  disabled: boolean
  onError: (message: string) => void
}

export function ExportControl({ editor, name, disabled, onError }: Props) {
  const [format, setFormat] = useState<ExportFormat>('png')
  const [scale, setScale] = useState<ExportScale>(1)
  const [busy, setBusy] = useState(false)

  const saveExport = async () => {
    const current = editor.current
    if (!current) return
    setBusy(true)
    try {
      const { blob } = await current.export({ format, scale })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = exportFileName(name, current.getDocument().canvas, scale, format)
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (e) {
      onError(`Export failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <label>
        Format{' '}
        <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} disabled={disabled}>
          {EXPORT_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label>
        Scale{' '}
        <select value={scale} onChange={(e) => setScale(Number(e.target.value) as ExportScale)} disabled={disabled}>
          {EXPORT_SCALES.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={saveExport} disabled={disabled || busy}>
        Export
      </button>
    </>
  )
}
