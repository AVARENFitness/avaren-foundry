import { CalendarDays, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import { normalizeAthleteScheduledSession } from '../lib/coachScheduledSessions'
import {
  formatAppointmentDuration,
  formatAppointmentHeadline,
  locationLabel,
} from '../lib/coachingAppointment'
import {
  formatScheduledSessionDate,
  formatScheduledSessionTime,
} from '../lib/sessionTimezone'
import { RSVP_STATUS, canAthleteUpdateRsvp, rsvpAthleteLabel } from '../lib/sessionRsvp'
import { useAthleteAppointments } from '../hooks/useAthleteAppointments'
import AthleteAppointmentDetailSheet from './AthleteAppointmentDetailSheet'

const ICON = { size: 18, strokeWidth: 1.75 }

export default function AthleteScheduledSessions({
  onSessionsChange,
}) {
  const { upcomingAppointments: sessions, loading, refreshAppointments: reload } =
    useAthleteAppointments()
  const [updatingId, setUpdatingId] = useState(null)
  const [detailSession, setDetailSession] = useState(null)

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    onSessionsChange?.(sessions)
  }, [onSessionsChange, sessions])

  useEffect(() => () => setDetailSession(null), [])

  const handleRsvp = async (session, rsvpStatus) => {
    if (!canAthleteUpdateRsvp(session) || updatingId === session.id) return

    setUpdatingId(session.id)
    try {
      const result = await coachBackend.updateSessionRsvp(session.id, rsvpStatus)
      if (!result.ok) {
        appUi.toast('Could not update your response.', 'error')
        return
      }

      await reload()
      appUi.toast(
        rsvpStatus === RSVP_STATUS.CONFIRMED
          ? 'Session confirmed.'
          : 'Coach notified you cannot make it.',
        'success',
      )
    } catch (error) {
      appUi.toast(error.message ?? 'Could not update your response.', 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) return null
  if (!sessions.length) return null

  return (
    <>
      <section className="athlete-scheduled-sessions-card" aria-label="Upcoming training sessions">
        <header>
          <span className="coach-profile-card-icon" aria-hidden="true">
            <CalendarDays {...ICON} />
          </span>
          <div>
            <span className="eyebrow">UPCOMING SESSIONS</span>
            <h2>In-person training</h2>
          </div>
        </header>

        <div className="athlete-scheduled-sessions-list">
          {sessions.map((session) => (
            <article key={session.id} className={`athlete-scheduled-session rsvp-${session.rsvpStatus}`}>
              <button
                type="button"
                className="athlete-scheduled-session-main"
                onClick={() => setDetailSession(session)}
              >
                <div>
                  <strong>{formatAppointmentHeadline(session)}</strong>
                  <span>
                    {formatScheduledSessionDate(session)} · {formatScheduledSessionTime(session)}
                  </span>
                  <span className="athlete-scheduled-session-meta">
                    {formatAppointmentDuration(session)}
                    {locationLabel(session) !== 'Default location'
                      ? ` · ${locationLabel(session)}`
                      : ''}
                  </span>
                  <small className="athlete-rsvp-status">{rsvpAthleteLabel(session.rsvpStatus)}</small>
                </div>
              </button>
              {canAthleteUpdateRsvp(session) && (
                <div className="athlete-rsvp-actions">
                  <button
                    type="button"
                    className={session.rsvpStatus === RSVP_STATUS.CONFIRMED ? 'active' : ''}
                    disabled={updatingId === session.id}
                    onClick={() => handleRsvp(session, RSVP_STATUS.CONFIRMED)}
                  >
                    <Check size={16} />
                    Confirm
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <AthleteAppointmentDetailSheet
        appointment={detailSession}
        open={Boolean(detailSession)}
        onClose={() => setDetailSession(null)}
        onUpdated={async (updated) => {
          await reload()
          setDetailSession(updated)
        }}
      />
    </>
  )
}

export async function respondToSessionRsvpFromPush(sessionId, rsvpStatus) {
  const result = await coachBackend.updateSessionRsvp(sessionId, rsvpStatus)
  if (!result.ok) {
    throw new Error(result.error ?? 'rsvp_failed')
  }
  return normalizeAthleteScheduledSession(result.session)
}
