import { CalendarDays, ChevronRight } from 'lucide-react'
import {
  appointmentTypeLabel,
  formatAppointmentHomeWhen,
  linkedWorkoutTitle,
} from '../lib/coachingAppointment'

export default function AthleteNextAppointment({
  appointment = null,
  onViewDetails,
  compact = false,
}) {
  if (!appointment) return null

  const when = formatAppointmentHomeWhen(appointment)
  const coachName = appointment.coachDisplayName ?? 'Coach'
  const sessionType = appointmentTypeLabel(appointment)
  const workoutTitle = linkedWorkoutTitle(appointment)

  if (compact) {
    return (
      <button
        type="button"
        className="athlete-next-appointment athlete-next-appointment--compact"
        onClick={() => onViewDetails?.(appointment)}
      >
        <span className="eyebrow">IN-PERSON SESSION</span>
        <strong>{when}</strong>
        <span className="athlete-next-appointment-type">{sessionType}</span>
        <span className="athlete-next-appointment-coach">with {coachName}</span>
        {workoutTitle ? (
          <span className="athlete-next-appointment-workout">{workoutTitle}</span>
        ) : null}
      </button>
    )
  }

  return (
    <section className="athlete-next-appointment-card">
      <header className="athlete-next-appointment-card-header">
        <span className="coach-profile-card-icon" aria-hidden="true">
          <CalendarDays size={18} strokeWidth={1.75} />
        </span>
        <div>
          <span className="eyebrow">IN-PERSON SESSION</span>
          <h2>{when}</h2>
        </div>
      </header>
      <div className="athlete-next-appointment-body">
        <strong className="athlete-next-appointment-type">{sessionType}</strong>
        <p className="athlete-next-appointment-coach">with {coachName}</p>
        {workoutTitle ? (
          <p className="athlete-next-appointment-workout">{workoutTitle}</p>
        ) : null}
      </div>
      {onViewDetails ? (
        <button
          type="button"
          className="home-today-plan-link athlete-next-appointment-link"
          onClick={() => onViewDetails(appointment)}
        >
          View session
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  )
}

export function AthleteAppointmentWeekStrip({ appointments = [] }) {
  if (appointments.length <= 1) return null

  return (
    <section className="athlete-appointment-week-strip" aria-label="Upcoming in-person sessions">
      <span className="eyebrow">UPCOMING</span>
      <ul>
        {appointments.slice(0, 4).map((item) => (
          <li key={item.id}>
            <strong>{formatAppointmentHomeWhen(item)}</strong>
            <span>{appointmentTypeLabel(item)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
