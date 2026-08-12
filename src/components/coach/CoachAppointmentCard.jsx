import { getClientDisplayName } from '../../lib/clientDisplayName'
import {
  coachAppointmentCardStatus,
  formatAppointmentDuration,
  locationLabel,
} from '../../lib/coachingAppointment'
import { formatScheduledSessionTime } from '../../lib/sessionTimezone'
import { isRsvpException } from '../../lib/sessionRsvp'

export default function CoachAppointmentCard({
  session,
  client = null,
  onClick,
  className = '',
}) {
  const clientName = getClientDisplayName(client ?? {}) || 'Client'
  const time = formatScheduledSessionTime(session)
  const duration = formatAppointmentDuration(session)
  const place = locationLabel(session)
  const placeLabel =
    place && place !== 'Default location' ? place : 'AVAREN Gym'
  const status = coachAppointmentCardStatus(session)
  const showStatus =
    status !== 'Scheduled' ||
    isRsvpException(session) ||
    session?.rsvpStatus === 'confirmed' ||
    session?.rsvpStatus === 'awaiting_response'

  return (
    <button
      type="button"
      className={`coach-appointment-card${isRsvpException(session) ? ' coach-appointment-card--attention' : ''} ${className}`.trim()}
      onClick={() => onClick?.(session)}
      data-testid="coach-appointment-card"
    >
      <div className="coach-appointment-card-main">
        <strong className="coach-appointment-card-time">{time}</strong>
        <span className="coach-appointment-card-client">{clientName}</span>
        <span className="coach-appointment-card-meta">
          {duration} · {placeLabel}
        </span>
      </div>
      {showStatus ? (
        <span
          className={`coach-appointment-card-status coach-appointment-card-status--${status.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {status}
        </span>
      ) : null}
    </button>
  )
}
