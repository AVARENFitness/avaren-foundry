import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppModalLayer } from '../../hooks/useAppModalLayer'

export default function AppUiBackdrop({
  open = false,
  onClose,
  className = '',
  children,
  onEscape,
}) {
  useAppModalLayer(open)

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (typeof onEscape === 'function') {
        onEscape(event)
        return
      }
      onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, onEscape])

  if (!open) return null

  return createPortal(
    <div
      className={`app-ui-backdrop ${className}`.trim()}
      role="presentation"
      data-app-ui-backdrop="open"
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  )
}
