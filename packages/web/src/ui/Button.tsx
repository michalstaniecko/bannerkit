// Button: a text button with an optional leading icon. `variant` picks the look
// (default, primary, ghost); styles live in ui.css on semantic tokens.
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'default' | 'primary' | 'ghost'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  icon?: LucideIcon
}

/** Icon size (px) in buttons, matching the UI text. */
export const ICON_SIZE = 16

export function Button({ variant = 'default', icon: Icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className={className ? `button ${className}` : 'button'} data-variant={variant}>
      {Icon && <Icon size={ICON_SIZE} aria-hidden="true" />}
      {children}
    </button>
  )
}
