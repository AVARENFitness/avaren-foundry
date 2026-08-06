import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react'

const TONE_META = {
  success: { icon: CheckCircle2, className: 'tone-success' },
  error: { icon: AlertTriangle, className: 'tone-error' },
  info: { icon: Info, className: 'tone-info' },
}

export default function Toast({
  message,
  tone = 'info',
  actionLabel = null,
  onAction = null,
  onDismiss,
}) {
  const meta = TONE_META[tone] ?? TONE_META.info
  const Icon = meta.icon

  return (
    <article
      className={`app-toast ${meta.className}${actionLabel ? ' has-action' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="app-toast-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="app-toast-copy">
        <p>{message}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            className="app-toast-action"
            onClick={() => {
              onAction()
              onDismiss?.()
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        className="app-toast-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </article>
  )
}

export function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null

  return (
    <div className="app-toast-stack" aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          tone={toast.tone}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  )
}
