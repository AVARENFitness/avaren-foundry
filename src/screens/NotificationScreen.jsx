import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  CalendarDays,
  Check,
  Dumbbell,
  Hammer,
  HeartPulse,
  Wind,
  X,
} from 'lucide-react'

const ICONS = {
  readiness: HeartPulse,
  workout: Dumbbell,
  recovery: Wind,
  missed: CalendarDays,
  forge: Hammer,
  streak: Check,
}

const timeLabel = (value) => {
  const date = new Date(value)
  const difference = Date.now() - date.getTime()

  if (difference < 3600000) return 'Just now'
  if (difference < 86400000) {
    return `${Math.floor(
      difference / 3600000,
    )}h ago`
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

export default function NotificationScreen({
  snapshot,
  onClose,
  onRead,
  onDismiss,
  onAction,
}) {
  return (
    <section className="notification-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <span className="eyebrow">SMART REMINDERS</span>
          <h1>Notifications</h1>
        </div>
      </header>

      <section className="notification-hero">
        <Bell size={26} />
        <div>
          <span className="eyebrow">INBOX</span>
          <h2>
            {snapshot.unreadCount
              ? `${snapshot.unreadCount} unread`
              : 'All caught up'}
          </h2>
          <p>
            AVAREN only surfaces reminders that support
            today’s training, recovery, or progress.
          </p>
        </div>
      </section>

      {!snapshot.notifications.length && (
        <section className="empty-state">
          <BellOff size={25} />
          <h2>No active notifications.</h2>
          <p>
            You’re caught up. New reminders will appear when
            something needs attention.
          </p>
        </section>
      )}

      <div className="notification-list">
        {snapshot.notifications.map((notification) => {
          const Icon =
            ICONS[notification.type] ?? Bell

          return (
            <article
              key={notification.fingerprint}
              className={`notification-item ${
                notification.read ? 'read' : 'unread'
              }`}
              onClick={() => onRead(notification)}
            >
              <div className="notification-item-icon">
                <Icon size={19} />
              </div>

              <div className="notification-item-copy">
                <div>
                  <span>
                    {notification.type.replace('-', ' ')}
                  </span>
                  <small>
                    {timeLabel(notification.createdAt)}
                  </small>
                </div>
                <strong>{notification.title}</strong>
                <p>{notification.body}</p>

                <div className="notification-item-actions">
                  {notification.actionLabel && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        onAction(notification)
                      }}
                    >
                      {notification.actionLabel}
                      <ArrowRight size={14} />
                    </button>
                  )}
                  <button
                    className="dismiss"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDismiss(notification)
                    }}
                  >
                    Dismiss
                    <X size={13} />
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
