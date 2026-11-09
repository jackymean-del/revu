/**
 * The few icons revU uses, drawn here so no icon library is loaded: 24 by 24,
 * stroked in the current colour. Decorative by default; give a label where
 * the icon is the only thing saying what a control does.
 */
import { PATHS, type IconName } from './icon-paths'

export function Icon({ name, size = 18, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
