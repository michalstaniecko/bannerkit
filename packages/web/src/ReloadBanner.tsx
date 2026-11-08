// The External change banner (spec): a Document changed on disk while the editor
// had unsaved edits. Each button resolves the live-reload Conflict as labelled.
import type { Conflict } from './live-reload.ts'
import { Button } from './ui/Button.tsx'

export function ReloadBanner({ conflict }: { conflict: Conflict | null }) {
  if (!conflict) return null
  return (
    <div className="reload-banner" role="alert">
      <span>File changed on disk</span>
      <Button variant="primary" onClick={() => void conflict.reload()}>
        Reload
      </Button>
      <Button onClick={() => void conflict.keepMine()}>Keep mine</Button>
    </div>
  )
}
