import { CalendarDays } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { coachBackend } from '../../lib/coachBackend'
import { resolveRecordBusinessClientId } from '../../lib/coachBusinessClient'
import { appointmentsOnDate } from '../../lib/coachingAppointment'
import { filterPendingCoachHubAppointments } from '../../lib/coachHubAppointments'
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
    const timerId = window.setInterval(() => setNow(Date.now()), 30_000)

    return () => {
      document.removeEventListener('visibilitychange', refetchOnFocus)
      window.removeEventListener('focus', refetchOnFocus)
      window.clearInterval(timerId)
    }
  }, [loadToday])

  const todayItems = useMemo(
    () => filterPendingCoachHubAppointments(appointmentsOnDate(sessions, dateKey(new Date(now))), new Date(now)),
    [sessions, now],
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
          <h2>Who you&apos;re training</h2>
        </div>
        <div className="coach-today-schedule-actions">
          <button type="button" className="coach-secondary-button" onClick={onSchedule}>
            Schedule
          </button>
          <button type="button" className="coach-secondary-button" onClick={onOpenCalendar}>
            View week
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

      {loading && sessions.length === 0 ? null : todayItems.length === 0 && !loadIssue ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled today"
          description="Your calendar is clear for today."
          actionLabel="View week"
          onAction={onOpenCalendar}
        />
      ) : todayItems.length > 0 ? (
        <ul className="coach-today-schedule-list">
          {todayItems.map((item, index) => {
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
                  isNext={index === 0}
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
      )}
    </section>
  )
}
