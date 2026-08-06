import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react'

const TONE_META = {
  success: { icon: CheckCircle2, className: 'tone-success' },
  error: { icon: AlertTriangle, className: 'tone-error' },
  info: { icon: Info, className: 'tone-info' },
}

export default function Toast({ message, tone = 'info', onDismiss }) {
  const meta = TONE_META[tone] ?? TONE_META.info
  const Icon = meta.icon

  return (
    <article
      className={`app-toast ${meta.className}`}
      role="status"
      aria-live="polite"
    >
      <span className="app-toast-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <p>{message}</p>
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
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  )
}
