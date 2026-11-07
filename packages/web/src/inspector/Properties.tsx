// The Inspector's "Properties" tab: the Selection's properties, or the Document's when
// the Selection is empty. Empty for now; the fields come with the Inspector tickets.
import type { RefObject } from 'react'
import type { Editor } from '../editor/index.ts'

type Props = {
  editor: RefObject<Editor | null>
  loaded: boolean
}

export function Properties(_: Props) {
  return <div className="inspector-properties" />
}
