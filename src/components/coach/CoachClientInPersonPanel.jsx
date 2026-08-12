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
import {
  appointmentPassEffectMeta,
  indexLedgerBySessionId,
  normalizePassLedgerEntry,
} from '../../lib/coachPass'
import CoachAppointmentCard from './CoachAppointmentCard'
import CoachClientTrainingPassPanel from './CoachClientTrainingPassPanel'

const HISTORY_WINDOW_DAYS = 180
const HISTORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'missed', label: 'Missed' },
]

export default function CoachClientInPersonPanel({
  client = null,
  onOpenSession,
  onPassContextChange,
  showPassPanel = true,
  showUpcoming = true,
  showHistory = true,
}) {
  const [sessions, setSessions] = useState([])
  const [ledger, setLedger] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyFilter, setHistoryFilter] = useState('all')

  const athleteId = client?.athlete_id ?? null
  const businessClientId =
    client?.business_client_id ?? client?.businessClientId ?? null

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
      const [rows, ledgerRows] = await Promise.all([
        coachBackend.listScheduledSessions({
          startDate,
          endDate,
          athleteId,
        }),
        businessClientId
          ? coachBackend.listClientPassLedger(businessClientId, 200)
          : Promise.resolve([]),
      ])
      setSessions(rows.map(normalizeScheduledSession).filter(Boolean))
      setLedger(
        (ledgerRows ?? []).map(normalizePassLedgerEntry).filter(Boolean),
      )
    } catch {
      setSessions([])
      setLedger([])
    } finally {
      setLoading(false)
    }
  }, [athleteId, businessClientId])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const ledgerBySessionId = useMemo(
    () => indexLedgerBySessionId(ledger),
    [ledger],
  )

  const upcomingAppointments = useMemo(
    () => filterActiveAppointments(sessions),
    [sessions],
  )

  const nextAppointment = useMemo(
    () => nextUpcomingAppointment(upcomingAppointments),
    [upcomingAppointments],
  )

  const historySummary = useMemo(
    () => summarizeAppointmentHistory(sessions),
    [sessions],
  )

  const historyItems = useMemo(() => {
    const items = filterAppointmentHistory(sessions)
    if (historyFilter === 'all') return items.slice(0, 20)
    return items
      .filter((session) => session.status === historyFilter)
      .slice(0, 20)
  }, [sessions, historyFilter])

  if (loading) {
    return <p className="coach-client-in-person-loading">Loading sessions…</p>
  }

  return (
    <section className="coach-client-in-person-panel">
      {showPassPanel ? (
        <CoachClientTrainingPassPanel
          client={client}
          onPassContextChange={onPassContextChange}
        />
      ) : null}

      {showUpcoming ? (
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
      ) : null}

      {showHistory ? (
        <>
          <div className="coach-client-in-person-history-summary">
            <h3>Recent history</h3>
            <ul className="coach-client-in-person-stats">
              <li>
                <strong>{historySummary.upcoming}</strong>
                <span>Upcoming</span>
              </li>
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
            <div className="coach-client-in-person-history-filters">
              {HISTORY_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={historyFilter === filter.id ? 'active' : ''}
                  onClick={() => setHistoryFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {historyItems.length > 0 ? (
            <ul className="coach-client-in-person-history-list">
              {historyItems.map((session) => {
                const effect = appointmentPassEffectMeta(session, ledgerBySessionId)
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={`coach-client-in-person-history-row coach-client-in-person-history-row--${effect.tone}`}
                      onClick={() => onOpenSession?.(session)}
                    >
                      <div className="coach-client-in-person-history-row-main">
                        <strong>{formatAppointmentWhen(session)}</strong>
                        <span
                          className={`coach-client-in-person-history-chip coach-client-in-person-history-chip--${effect.tone}`}
                        >
                          {effect.chip}
                        </span>
                      </div>
                      {effect.detail ? (
                        <small className="coach-client-in-person-pass-effect">
                          {effect.detail}
                        </small>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="coach-client-in-person-empty">No session history yet.</p>
          )}
        </>
      ) : null}
    </section>
  )
}
