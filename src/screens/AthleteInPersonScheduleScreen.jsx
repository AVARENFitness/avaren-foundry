import { CalendarDays, ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import AthleteAppointmentDetailSheet from '../components/AthleteAppointmentDetailSheet'
import { useAthleteAppointments } from '../hooks/useAthleteAppointments'
import {
  appointmentTypeLabel,
  formatAppointmentDuration,
  formatAppointmentHomeWhen,
  linkedWorkoutTitle,
  locationLabel,
} from '../lib/coachingAppointment'
import { canAthleteUpdateRsvp, RSVP_STATUS, rsvpAthleteLabel } from '../lib/sessionRsvp'

export default function AthleteInPersonScheduleScreen({ onBack }) {
  const {
    upcomingAppointments,
    loading,
    ready,
    refreshAppointments,
  } = useAthleteAppointments()
  const [detailAppointment, setDetailAppointment] = useState(null)

  useEffect(() => {
    refreshAppointments({ force: true })
  }, [refreshAppointments])

  useEffect(() => () => setDetailAppointment(null), [])

  return (
    <div className="athlete-in-person-schedule-screen">
      <header className="athlete-in-person-schedule-header">
        <button type="button" className="ui-btn-tertiary athlete-schedule-back" onClick={onBack}>
          <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          Back
        </button>
        <div>
          <span className="eyebrow">SCHEDULE</span>
          <h1>In-person sessions</h1>
          <p className="athlete-in-person-schedule-lede">
            Upcoming sessions with your coach.
          </p>
        </div>
      </header>

      {!ready && loading ? (
        <p className="athlete-in-person-schedule-empty">Loading sessions…</p>
      ) : ready && upcomingAppointments.length ? (
        <ul className="athlete-in-person-schedule-list">
          {upcomingAppointments.map((appointment) => {
            const place = locationLabel(appointment)
            const placeLabel =
              place && place !== 'Default location' ? place : 'AVAREN Gym'
            const workoutTitle = linkedWorkoutTitle(appointment)
            const showStatus =
              canAthleteUpdateRsvp(appointment) &&
              appointment.rsvpStatus === RSVP_STATUS.AWAITING

            return (
              <li key={appointment.id}>
                <button
                  type="button"
                  className="athlete-in-person-schedule-item athlete-appointment-card athlete-in-person-schedule-item-button"
                  onClick={() => setDetailAppointment(appointment)}
                >
                  <span className="eyebrow">{appointmentTypeLabel(appointment).toUpperCase()}</span>
                  <strong className="athlete-appointment-card-when">
                    {formatAppointmentHomeWhen(appointment)}
                  </strong>
                  <span className="athlete-appointment-card-with">
                    with {appointment.coachDisplayName ?? 'Coach'}
                  </span>
                  <span className="athlete-appointment-card-meta">
                    {formatAppointmentDuration(appointment)} · {placeLabel}
                  </span>
                  {workoutTitle ? (
                    <span className="athlete-appointment-card-workout">{workoutTitle}</span>
                  ) : null}
                  {showStatus ? (
                    <span className="athlete-appointment-status-pill athlete-appointment-status-pill--compact">
                      {rsvpAthleteLabel(appointment.rsvpStatus)}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : ready ? (
        <div className="athlete-in-person-schedule-empty">
          <CalendarDays size={28} strokeWidth={1.5} />
          <p>No in-person sessions scheduled.</p>
        </div>
      ) : null}

      <AthleteAppointmentDetailSheet
        appointment={detailAppointment}
        open={Boolean(detailAppointment)}
        onClose={() => setDetailAppointment(null)}
        onUpdated={(updated) => {
          refreshAppointments({ force: true })
          setDetailAppointment(updated)
        }}
      />
    </div>
  )
}
