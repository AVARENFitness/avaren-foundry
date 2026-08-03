import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  Hammer,
  HeartPulse,
  Wind,
} from 'lucide-react'

const ICONS = {
  readiness: HeartPulse,
  workout: Dumbbell,
  recovery: Wind,
  missed: CalendarDays,
  forge: Hammer,
  streak: CheckCircle2,
}

export default function NotificationPreview({
  snapshot,
  onOpen,
}) {
  const primary = snapshot?.primary

  if (!primary) {
    return (
      <button
        className="notification-preview empty"
        onClick={onOpen}
      >
        <div className="notification-preview-icon">
          <Bell size={20} />
        </div>
        <div>
          <span className="eyebrow">NOTIFICATIONS</span>
          <strong>You’re all caught up.</strong>
          <small>
            AVAREN will surface readiness, training, recovery,
            and milestone reminders here.
          </small>
        </div>
        <ArrowRight size={17} />
      </button>
    )
  }

  const Icon = ICONS[primary.type] ?? Bell

  return (
    <button
      className="notification-preview"
      onClick={onOpen}
    >
      <div className="notification-preview-icon">
        <Icon size={20} />
      </div>

      <div>
        <span className="eyebrow">
          {snapshot.unreadCount} NEW NOTIFICATION
          {snapshot.unreadCount === 1 ? '' : 'S'}
        </span>
        <strong>{primary.title}</strong>
        <small>{primary.body}</small>
      </div>

      <ArrowRight size={17} />
    </button>
  )
}
