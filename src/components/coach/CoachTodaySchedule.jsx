import { CalendarDays } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { coachBackend } from '../../lib/coachBackend'
import { resolveRecordBusinessClientId } from '../../lib/coachBusinessClient'
import { sortAppointmentsByStart } from '../../lib/coachingAppointment'
import { partitionCoachTodayAppointments } from '../../lib/coachHubAppointments'
import { dateKey } from '../../lib/appointmentScheduling'
import { appointmentTypeLabel } from '../../lib/coachingAppointment'
import { formatRosterPassLabel } from '../../lib/coachClientRosterUi'
import {
  normalizeScheduledSession,
  sortScheduledSessions,
} from '../../lib/coachScheduledSessions'
import CoachAppointmentCard from './CoachAppointmentCard'
import EmptyState from '../ui/EmptyState'


const resolveContextSignal = ({
  session,
  passSummary = null,
  client = null,
}) => {
  if (passSummary?.activeCount > 0) {
    const passText = formatRosterPassLabel(passSummary)
    if (passText.includes('No sessions') || passText.includes('1 session')) {
      return passText
    }
  }

  if (session?.coachNotes) {
    return String(session.coachNotes).slice(0, 72)
  }

  if (client?.display_name) {
    return null
  }

  return null
}

export default function CoachTodaySchedule({
  clients = [],
  passSummaryByBusinessClientId = {},
  onSchedule,
  onOpenCalendar,
  onOpenClient,
  onOpenSession,
  onOpenClientSection,
  refreshSignal = 0,
}) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadIssue, setLoadIssue] = useState(false)
  const latestRequestRef = useRef(0)
  const [now, setNow] = useState(() => Date.now())

  const clientByAthleteId = useMemo(
    () => Object.fromEntries(clients.map((client) => [client.athlete_id, client])),
    [clients],
  )

  const clientByBusinessClientId = useMemo(
    () =>
      Object.fromEntries(
        clients
          .map((client) => [resolveRecordBusinessClientId(client), client])
          .filter(([id]) => Boolean(id)),
      ),
    [clients],
  )

  const loadToday = useCallback(async () => {
    const requestId = ++latestRequestRef.current
    setLoading(true)
    try {
      const key = dateKey(new Date())
      const rows = await coachBackend.listScheduledSessions({
        startDate: key,
        endDate: key,
      })
      if (requestId !== latestRequestRef.current) return
      setSessions(
        sortScheduledSessions((rows ?? []).map(normalizeScheduledSession).filter(Boolean)),
      )
      setLoadIssue(false)
    } catch {
      if (requestId !== latestRequestRef.current) return
      // A failed refresh must not erase booked sessions and suggest the
      // coach has an open day.
      setLoadIssue(true)
    } finally {
      if (requestId === latestRequestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadToday()
  }, [loadToday, refreshSignal])

  useEffect(() => {
    const refetchOnFocus = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now())
        loadToday()
      }
    }

    document.addEventListener('visibilitychange', refetchOnFocus)
    window.addEventListener('focus', refetchOnFocus)
    window.addEventListener('avaren:coach-today-updated', loadToday)
    const timerId = window.setInterval(() => setNow(Date.now()), 30_000)

    return () => {
      document.removeEventListener('visibilitychange', refetchOnFocus)
      window.removeEventListener('focus', refetchOnFocus)
      window.removeEventListener('avaren:coach-today-updated', loadToday)
      window.clearInterval(timerId)
    }
  }, [loadToday])

  const todayItems = useMemo(
    () => sortAppointmentsByStart(
      sessions.filter((item) => item.sessionDate === dateKey(new Date(now))),
    ),
    [sessions, now],
  )
  const { upcoming, earlier } = useMemo(
    () => partitionCoachTodayAppointments(todayItems, new Date(now)),
    [todayItems, now],
  )

  const resolveClientForSession = (session) => {
    const businessClientId =
      session.businessClientId ?? session.business_client_id ?? null
    if (businessClientId && clientByBusinessClientId[businessClientId]) {
      return clientByBusinessClientId[businessClientId]
    }
    return clientByAthleteId[session.athleteId] ?? null
  }

  return (
    <section className="coach-today-schedule">
      <header className="coach-today-schedule-header">
        <div>
          <span className="eyebrow">TODAY</span>
          <h2>Your day</h2>
        </div>
        <div className="coach-today-schedule-actions">
          <button type="button" className="coach-secondary-button" onClick={onSchedule}>
            Schedule
          </button>
          <button type="button" className="coach-secondary-button" onClick={onOpenCalendar}>
            Calendar
          </button>
        </div>
      </header>

      {loadIssue ? (
        <div className="coach-today-sync-warning" role="alert">
          Schedule could not refresh. Previous appointments are retained.
          <button type="button" onClick={() => void loadToday()} disabled={loading}>
            Retry
          </button>
        </div>
      ) : null}

      {loading && sessions.length === 0 ? null : upcoming.length + earlier.length === 0 && !loadIssue ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled today"
          description="No training sessions on today's calendar. Check the full calendar for personal events."
          actionLabel="Open calendar"
          onAction={onOpenCalendar}
        />
      ) : upcoming.length + earlier.length > 0 ? (
        <div className="coach-today-agenda">
          <p className="coach-today-agenda-summary" aria-live="polite">
            {upcoming.length} upcoming · {earlier.length} earlier
          </p>
          {[
            { key: 'upcoming', title: 'Upcoming', items: upcoming },
            { key: 'earlier', title: 'Earlier today', items: earlier },
          ].filter((group) => group.items.length > 0).map((group) => (
            <section key={group.key} className="coach-today-agenda-group" aria-label={group.title}>
              <h3 className="coach-today-agenda-label">
                {group.title} <span>{group.items.length}</span>
              </h3>
              <ul className="coach-today-schedule-list">
                {group.items.map((item, index) => {
                  const client = resolveClientForSession(item)
                  const businessClientId = resolveRecordBusinessClientId(client)
                  const passSummary =
                    passSummaryByBusinessClientId[businessClientId] ?? null
                  const contextSignal = resolveContextSignal({
                    session: item,
                    passSummary,
                    client,
                  })

                  return (
                    <li key={item.id} className="coach-today-schedule-item">
                      <CoachAppointmentCard
                        session={item}
                        client={client}
                        className="coach-today-schedule-card"
                        isNext={group.key === 'upcoming' && index === 0}
                        isPast={group.key === 'earlier'}
                        appointmentTypeLabel={appointmentTypeLabel(item)}
                        contextSignal={contextSignal}
                        onClick={(session) => {
                          if (onOpenSession) {
                            onOpenSession(session)
                            return
                          }
                          onOpenClient?.(resolveClientForSession(session))
                        }}
                      />
                      {client ? (
                        <div className="coach-today-quick-actions">
                          <button
                            type="button"
                            className="coach-secondary-button"
                            onClick={() => onOpenClient?.(client)}
                          >
                            Open client
                          </button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  )
}
