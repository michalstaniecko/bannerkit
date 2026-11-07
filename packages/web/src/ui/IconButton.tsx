// IconButton: a square button showing only an icon. `label` is its accessible name and
// tooltip (with the keyboard `shortcut`, if any). `pressed` makes it a toggle button
// (e.g. the Snapping switch in M3).
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { ICON_SIZE, type ButtonVariant } from './Button.tsx'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: LucideIcon
  label: string
  shortcut?: string
  pressed?: boolean
  variant?: ButtonVariant
}

export function IconButton({ icon: Icon, label, shortcut, pressed, variant = 'ghost', className, type = 'button', ...rest }: Props) {
  return (
    <button
      title={shortcut ? `${label} (${shortcut})` : label}
      {...rest}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={className ? `icon-button ${className}` : 'icon-button'}
      data-variant={variant}
    >
      <Icon size={ICON_SIZE} aria-hidden="true" />
    </button>
  )
}
