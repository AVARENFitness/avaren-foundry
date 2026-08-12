import { useEffect, useId, useRef } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import AppUiBackdrop from './AppUiBackdrop'

const TONE_META = {
  default: { icon: Info, className: 'tone-default' },
  danger: { icon: AlertTriangle, className: 'tone-danger' },
  info: { icon: Info, className: 'tone-info' },
}

export default function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  showCancel = true,
  onConfirm,
  onCancel,
}) {
  const titleId = useId()
  const messageId = useId()
  const confirmRef = useRef(null)
  const meta = TONE_META[tone] ?? TONE_META.default
  const Icon = meta.icon

  useEffect(() => {
    if (!open) return undefined
    confirmRef.current?.focus()
  }, [open])

  return (
    <AppUiBackdrop open={open} onClose={onCancel}>
      <section
        className={`confirmation-dialog ${meta.className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="confirmation-dialog-header">
          <span className="confirmation-dialog-icon" aria-hidden="true">
            <Icon size={20} />
          </span>
          <div>
            {title && (
              <h2 id={titleId}>{title}</h2>
            )}
            {!title && (
              <span className="eyebrow">AVAREN</span>
            )}
          </div>
          <button
            type="button"
            className="confirmation-dialog-close"
            onClick={onCancel}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </header>

        <p id={messageId} className="confirmation-dialog-message">
          {message}
        </p>

        <div className="confirmation-dialog-actions">
          {showCancel && (
            <button
              type="button"
              className="confirmation-dialog-cancel"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`confirmation-dialog-confirm ${tone === 'danger' ? 'danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </AppUiBackdrop>
  )
}
