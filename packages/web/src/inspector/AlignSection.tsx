// The Inspector's "Align" section, on top of Properties for a non-empty Selection
// (a Group too): Align and Distribute of the selected Layers through core
// `alignLayers` / `distributeLayers` with the editor's measure (ADR 0008), the same
// functions `bannerkit layer align` / `layer distribute` run. One Layer lines up with
// the Canvas, several with their Selection Box (core's default `to`); the tooltips
// say which. Distribute spaces the Layers equally with an empty Gap (3 or more) or by
// the Gap in px (2 or more); the Gap is held by the caller for the session, never in
// the Document. Every button is off while a selected Layer is effectively locked or
// hidden, as the nudge is. Each click is one recipe for the caller to commit (one
// undo step); the Selection stays. No keyboard shortcuts.
import { alignLayers, distributeLayers, inheritedFlags, type AlignEdge, type DistributeAxis, type Document, type MeasureText } from '@bannerkit/core'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  type LucideIcon,
} from 'lucide-react'
import type { DocumentRecipe } from '../editor/index.ts'
import { IconButton } from '../ui/IconButton.tsx'
import { Section } from '../ui/Panel.tsx'
import { TextField } from '../ui/TextField.tsx'

type Props = {
  document: Document
  selection: readonly string[]
  measure: MeasureText
  /** Px between distributed Layers; undefined spaces them equally. */
  gap: number | undefined
  onGapChange: (gap: number | undefined) => void
  onWrite: (recipe: DocumentRecipe) => void
}

const ALIGN: readonly { edge: AlignEdge; label: string; icon: LucideIcon }[] = [
  { edge: 'left', label: 'Align left', icon: AlignStartVertical },
  { edge: 'hcenter', label: 'Align horizontal centers', icon: AlignCenterVertical },
  { edge: 'right', label: 'Align right', icon: AlignEndVertical },
  { edge: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { edge: 'vcenter', label: 'Align vertical centers', icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
]

const DISTRIBUTE: readonly { axis: DistributeAxis; label: string; icon: LucideIcon }[] = [
  { axis: 'x', label: 'Distribute horizontally', icon: AlignHorizontalSpaceAround },
  { axis: 'y', label: 'Distribute vertically', icon: AlignVerticalSpaceAround },
]

/** A Gap the field takes: empty (equal spacing) or a whole number of px ≥ 0. */
const validGap = (value: string) => /^\s*\d*\s*$/.test(value)

export function AlignSection({ document, selection, measure, gap, onGapChange, onWrite }: Props) {
  const ids = [...selection]
  const target = ids.length === 1 ? 'Canvas' : 'Selection'
  const frozen = ids.some((id) => {
    const flags = inheritedFlags(document, id)
    return flags?.locked === true || flags?.hidden === true
  })
  const canDistribute = !frozen && ids.length >= (gap === undefined ? 3 : 2)

  /** Commits `edit`'s Document, or leaves the Document as it is when core refuses. */
  const write = (edit: (document: Document) => ReturnType<typeof alignLayers>) =>
    onWrite((document) => {
      const result = edit(document)
      return result.ok ? result.document : document
    })

  return (
    <Section title="Align">
      <div className="align-buttons">
        {ALIGN.map(({ edge, label, icon }) => (
          <IconButton
            key={edge}
            icon={icon}
            label={`${label} to ${target}`}
            disabled={frozen}
            onClick={() => write((document) => alignLayers(document, ids, [edge], measure))}
          />
        ))}
      </div>
      <div className="align-distribute">
        {DISTRIBUTE.map(({ axis, label, icon }) => (
          <IconButton
            key={axis}
            icon={icon}
            label={label}
            disabled={!canDistribute}
            onClick={() => write((document) => distributeLayers(document, ids, axis, measure, gap === undefined ? {} : { gap }))}
          />
        ))}
        <TextField
          label="Gap"
          value={gap === undefined ? '' : String(gap)}
          placeholder="Equal"
          valid={validGap}
          onCommit={(value) => onGapChange(value.trim() === '' ? undefined : Number(value))}
        />
      </div>
    </Section>
  )
}
