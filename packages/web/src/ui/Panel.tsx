// Panel: a side region of the editor window (Layer list, Inspector), named for
// assistive tech. Section: a titled group inside a Panel, with optional actions
// beside its heading (e.g. a shadow on/off switch in the Inspector).
import { useId, type HTMLAttributes, type ReactNode } from 'react'

type PanelProps = HTMLAttributes<HTMLElement> & { label: string }

export function Panel({ label, className, children, ...rest }: PanelProps) {
  return (
    <aside {...rest} aria-label={label} className={className ? `panel ${className}` : 'panel'}>
      {children}
    </aside>
  )
}

type SectionProps = {
  title: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function Section({ title, actions, className, children }: SectionProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={className ? `section ${className}` : 'section'}>
      <header className="section-header">
        <h2 id={headingId} className="section-title">
          {title}
        </h2>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      <div className="section-body">{children}</div>
    </section>
  )
}
