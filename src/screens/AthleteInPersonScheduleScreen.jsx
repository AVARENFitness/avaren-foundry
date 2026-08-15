import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft } from 'lucide-react'
import AthleteAppointmentDetailSheet from '../components/AthleteAppointmentDetailSheet'
import { useAthleteAppointments } from '../hooks/useAthleteAppointments'
import { coachBackend } from '../lib/coachBackend'
import {
  appointmentTypeLabel,
  appointmentStatusLabel,
  formatAppointmentDuration,
  formatAppointmentHomeWhen,
  formatAppointmentWhen,
  linkedWorkoutTitle,
  locationLabel,
} from '../lib/coachingAppointment'
import { normalizeAthleteScheduledSession } from '../lib/coachScheduledSessions'
import { canAthleteUpdateRsvp, RSVP_STATUS, rsvpAthleteLabel } from '../lib/sessionRsvp'

export default function AthleteInPersonScheduleScreen({
  onBack,
  embedded = false,
}) {
  const {
    upcomingAppointments,
    loading,
    ready,
    refreshAppointments,
  } = useAthleteAppointments()
  const [detailAppointment, setDetailAppointment] = useState(null)
  const [pastAppointments, setPastAppointments] = useState([])
  const [historyReady, setHistoryReady] = useState(false)

  useEffect(() => {
    refreshAppointments({ force: true })
  }, [refreshAppointments])

  useEffect(() => {
    let cancelled = false

    coachBackend
      .listAthleteScheduledSessionHistory()
      .then((rows) => {
        if (cancelled) return
        setPastAppointments(
          rows.map(normalizeAthleteScheduledSession).filter(Boolean),
        )
      })
      .catch(() => {
        if (!cancelled) setPastAppointments([])
      })
      .finally(() => {
        if (!cancelled) setHistoryReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => setDetailAppointment(null), [])

  return (
    <div className="athlete-in-person-schedule-screen">
      <header className="athlete-in-person-schedule-header">
        {!embedded ? (
          <button type="button" className="ui-btn-tertiary athlete-schedule-back" onClick={onBack}>
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            Back
          </button>
        ) : null}
        <div>
          <span className="eyebrow">SCHEDULE</span>
          <h1>{embedded ? 'Your schedule' : 'In-person sessions'}</h1>
          <p className="athlete-in-person-schedule-lede">
            {embedded
              ? 'Upcoming coaching sessions — date, time, and confirmation status.'
              : 'Upcoming sessions with your coach.'}
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
          <p>No upcoming coaching sessions.</p>
          <span>When your coach schedules a session, it will appear here.</span>
        </div>
      ) : null}

      {historyReady && pastAppointments.length > 0 ? (
        <section className="athlete-in-person-schedule-history">
          <header>
            <span className="eyebrow">PAST SESSIONS</span>
          </header>
          <ul className="athlete-in-person-schedule-list">
            {pastAppointments.map((appointment) => (
              <li key={appointment.id}>
                <button
                  type="button"
                  className="athlete-in-person-schedule-item athlete-appointment-card athlete-in-person-schedule-item-button athlete-in-person-schedule-item-button--history"
                  onClick={() => setDetailAppointment(appointment)}
                >
                  <strong className="athlete-appointment-card-when">
                    {formatAppointmentWhen(appointment)}
                  </strong>
                  <span className="athlete-appointment-status-pill athlete-appointment-status-pill--compact">
                    {appointmentStatusLabel(appointment)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
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
