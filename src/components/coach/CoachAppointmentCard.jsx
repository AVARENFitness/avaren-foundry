import { getClientDisplayName } from '../../lib/clientDisplayName'
import { coachAppointmentRowStatus } from '../../lib/coachCalendarUi'
import { formatAppointmentDuration } from '../../lib/coachingAppointment'
import { formatScheduledSessionTime } from '../../lib/sessionTimezone'
import { isRsvpException } from '../../lib/sessionRsvp'

export default function CoachAppointmentCard({
  session,
  client = null,
  onClick,
  className = '',
  isPast = false,
  isNext = false,
}) {
  const clientName = getClientDisplayName(client ?? {}) || 'Client'
  const time = formatScheduledSessionTime(session)
  const duration = formatAppointmentDuration(session)
  const status = coachAppointmentRowStatus(session)
  const needsAttention = isRsvpException(session)

  return (
    <button
      type="button"
      className={[
        'coach-appointment-card',
        isPast ? 'coach-appointment-card--past' : '',
        isNext ? 'coach-appointment-card--next' : '',
        needsAttention ? 'coach-appointment-card--attention' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onClick?.(session)}
      data-testid="coach-appointment-card"
      data-past={isPast ? 'true' : 'false'}
      data-next={isNext ? 'true' : 'false'}
    >
      <div className="coach-appointment-card-main">
        {isNext ? (
          <span className="coach-appointment-card-next-label">Next</span>
        ) : null}
        <strong className="coach-appointment-card-time">{time}</strong>
        <span className="coach-appointment-card-client">{clientName}</span>
        <span className="coach-appointment-card-meta">{duration}</span>
      </div>
      {status ? (
        <span
          className={`coach-appointment-card-status coach-appointment-card-status--${status.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {status}
        </span>
      ) : null}
    </button>
  )
}
