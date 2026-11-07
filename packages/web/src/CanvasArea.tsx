// The centre of the editor window: the scrolling viewport that holds the Canvas, with
// gutters reserved for the top and left rulers (M3) and an overlay layer stacked
// exactly over the Canvas (Canvas resize handles, later Guides). The overlay is DOM
// outside Fabric, so nothing in it reaches Render or Export; it ignores the pointer
// except where a child opts back in (`pointer-events: auto`).
import type { ReactNode, RefObject } from 'react'

type Props = {
  /** The scrolling element; Fit mode measures it. */
  viewportRef: RefObject<HTMLDivElement | null>
  /** Where the editor module mounts its Fabric canvases. */
  hostRef: RefObject<HTMLDivElement | null>
  loaded: boolean
  /** Shown in place of the Canvas while no Document is open. */
  placeholder?: ReactNode
  /** Rulers, filled in M3. */
  rulers?: { top?: ReactNode; left?: ReactNode; corner?: ReactNode }
  /** Drawn over the Canvas, sized like it at the current zoom. */
  overlay?: ReactNode
}

export function CanvasArea({ viewportRef, hostRef, loaded, placeholder, rulers, overlay }: Props) {
  return (
    <main className="canvas-area">
      <div className="ruler-corner">{rulers?.corner}</div>
      <div className="ruler-top">{rulers?.top}</div>
      <div className="ruler-left">{rulers?.left}</div>
      <div className="viewport" ref={viewportRef}>
        <div className="canvas-stage" hidden={!loaded}>
          <div className="canvas-host" ref={hostRef} />
          <div className="canvas-overlay">{overlay}</div>
        </div>
        {!loaded && placeholder}
      </div>
    </main>
  )
}
