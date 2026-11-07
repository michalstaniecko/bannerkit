// The Inspector's "Align" section, on top of Properties for a non-empty Selection
// (a Group too): Align and Distribute of the selected Layers through core
// `alignLayers` / `distributeLayers` with the editor's measure (ADR 0008), the same
// functions `bannerkit layer align` / `layer distribute` run. One Layer lines up with
// the Canvas, several with their Selection Box (core's default `to`). Each click is
// one recipe for the caller to commit (one undo step); the Selection stays.
import { alignLayers, type AlignEdge, type Document, type MeasureText } from '@bannerkit/core'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  type LucideIcon,
} from 'lucide-react'
import type { DocumentRecipe } from '../editor/index.ts'
import { IconButton } from '../ui/IconButton.tsx'
import { Section } from '../ui/Panel.tsx'

type Props = {
  document: Document
  selection: readonly string[]
  measure: MeasureText
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

export function AlignSection({ selection, measure, onWrite }: Props) {
  const ids = [...selection]
  const target = ids.length === 1 ? 'Canvas' : 'Selection'
  const align = (edge: AlignEdge) =>
    onWrite((document) => {
      const result = alignLayers(document, ids, [edge], measure)
      return result.ok ? result.document : document
    })

  return (
    <Section title="Align">
      <div className="align-buttons">
        {ALIGN.map(({ edge, label, icon }) => (
          <IconButton key={edge} icon={icon} label={`${label} to ${target}`} onClick={() => align(edge)} />
        ))}
      </div>
    </Section>
  )
}
