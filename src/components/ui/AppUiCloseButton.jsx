import { X } from 'lucide-react'

const ICON = { size: 18, strokeWidth: 1.75 }

export default function AppUiCloseButton({
  onClick,
  label = 'Close',
  className = '',
  ...props
}) {
  return (
    <button
      type="button"
      className={`app-ui-close-button ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      {...props}
    >
      <X {...ICON} aria-hidden="true" />
    </button>
  )
}
