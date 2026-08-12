import { useCallback, useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../../lib/coachBackend'
import { normalizeScheduledSession } from '../../lib/coachScheduledSessions'
import {
  filterActiveAppointments,
  filterAppointmentHistory,
  formatAppointmentWhen,
  nextUpcomingAppointment,
  summarizeAppointmentHistory,
} from '../../lib/coachingAppointment'
import { addDaysKey, dateKey } from '../../lib/appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from '../../lib/sessionTimezone'
import CoachAppointmentCard from './CoachAppointmentCard'

const HISTORY_WINDOW_DAYS = 180

export default function CoachClientInPersonPanel({
  client = null,
  onOpenSession,
}) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  const athleteId = client?.athlete_id ?? null

  const loadSessions = useCallback(async () => {
    if (!athleteId) {
      setSessions([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const today = dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE)
      const startDate = addDaysKey(today, -HISTORY_WINDOW_DAYS)
      const endDate = addDaysKey(today, 90)
      const rows = await coachBackend.listScheduledSessions({
        startDate,
        endDate,
        athleteId,
      })
      setSessions(rows.map(normalizeScheduledSession).filter(Boolean))
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [athleteId])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const nextAppointment = useMemo(
    () => nextUpcomingAppointment(filterActiveAppointments(sessions)),
    [sessions],
  )

  const historySummary = useMemo(
    () => summarizeAppointmentHistory(sessions),
    [sessions],
  )

  const historyItems = useMemo(
    () => filterAppointmentHistory(sessions).slice(0, 12),
    [sessions],
  )

  if (loading) {
    return <p className="coach-client-in-person-loading">Loading sessions…</p>
  }

  return (
    <section className="coach-client-in-person-panel">
      <header className="coach-client-in-person-header">
        <span className="eyebrow">IN-PERSON TRAINING</span>
      </header>

      <div className="coach-client-in-person-upcoming">
        <h3>Upcoming</h3>
        {nextAppointment ? (
          <CoachAppointmentCard
            session={nextAppointment}
            client={client}
            onClick={onOpenSession}
          />
        ) : (
          <p className="coach-client-in-person-empty">No upcoming sessions.</p>
        )}
      </div>

      <div className="coach-client-in-person-history-summary">
        <h3>History</h3>
        <ul className="coach-client-in-person-stats">
          <li>
            <strong>{historySummary.completed}</strong>
            <span>Completed</span>
          </li>
          <li>
            <strong>{historySummary.cancelled}</strong>
            <span>Cancelled</span>
          </li>
          <li>
            <strong>{historySummary.missed}</strong>
            <span>Missed</span>
          </li>
        </ul>
        {historySummary.total > 0 ? (
          <button
            type="button"
            className="coach-secondary-button coach-client-in-person-history-toggle"
            onClick={() => setShowHistory((current) => !current)}
          >
            {showHistory ? 'Hide history' : 'View history'}
          </button>
        ) : null}
      </div>

      {showHistory && historyItems.length > 0 ? (
        <ul className="coach-client-in-person-history-list">
          {historyItems.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                className="coach-client-in-person-history-row"
                onClick={() => onOpenSession?.(session)}
              >
                <strong>{formatAppointmentWhen(session)}</strong>
                <span>{session.status}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
