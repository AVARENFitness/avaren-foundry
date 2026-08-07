import { CalendarDays, Check, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import { normalizeAthleteScheduledSession } from '../lib/coachScheduledSessions'
import {
  formatScheduledSessionDate,
  formatScheduledSessionTime,
} from '../lib/sessionTimezone'
import { RSVP_STATUS, canAthleteUpdateRsvp, rsvpAthleteLabel } from '../lib/sessionRsvp'

const ICON = { size: 18, strokeWidth: 1.75 }

export default function AthleteScheduledSessions({ onSessionsChange }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await coachBackend.listAthleteScheduledSessions()
      const normalized = (Array.isArray(rows) ? rows : [])
        .map(normalizeAthleteScheduledSession)
        .filter(Boolean)
      setSessions(normalized)
      onSessionsChange?.(normalized)
    } catch {
      setSessions([])
      onSessionsChange?.([])
    } finally {
      setLoading(false)
    }
  }, [onSessionsChange])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleRsvp = async (session, rsvpStatus) => {
    if (!canAthleteUpdateRsvp(session) || updatingId === session.id) return

    setUpdatingId(session.id)
    try {
      const result = await coachBackend.updateSessionRsvp(session.id, rsvpStatus)
      if (!result.ok) {
        appUi.toast('Could not update your response.', 'error')
        return
      }

      const updated = normalizeAthleteScheduledSession(result.session)
      setSessions((current) => {
        const next = current.map((item) =>
          item.id === session.id ? updated : item,
        )
        onSessionsChange?.(next)
        return next
      })
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
            <div>
              <strong>{session.coachDisplayName ?? 'Coach'}</strong>
              <span>
                {formatScheduledSessionDate(session)} · {formatScheduledSessionTime(session)}
              </span>
              <small className="athlete-rsvp-status">{rsvpAthleteLabel(session.rsvpStatus)}</small>
            </div>
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
                <button
                  type="button"
                  className={session.rsvpStatus === RSVP_STATUS.CANNOT_ATTEND ? 'active' : ''}
                  disabled={updatingId === session.id}
                  onClick={() => handleRsvp(session, RSVP_STATUS.CANNOT_ATTEND)}
                >
                  <XCircle size={16} />
                  Can't make it
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export async function respondToSessionRsvpFromPush(sessionId, rsvpStatus) {
  const result = await coachBackend.updateSessionRsvp(sessionId, rsvpStatus)
  if (!result.ok) {
    throw new Error(result.error ?? 'rsvp_failed')
  }
  return normalizeAthleteScheduledSession(result.session)
}
