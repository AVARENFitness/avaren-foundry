import { CalendarDays } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../../lib/coachBackend'
import { resolveRecordBusinessClientId } from '../../lib/coachBusinessClient'
import { appointmentsOnDate } from '../../lib/coachingAppointment'
import { appointmentTypeLabel } from '../../lib/coachingAppointment'
import { formatRosterPassLabel } from '../../lib/coachClientRosterUi'
import {
  normalizeScheduledSession,
  sortScheduledSessions,
} from '../../lib/coachScheduledSessions'
import CoachAppointmentCard from './CoachAppointmentCard'
import EmptyState from '../ui/EmptyState'

const todayKey = () => new Date().toISOString().slice(0, 10)

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
    setLoading(true)
    try {
      const key = todayKey()
      const rows = await coachBackend.listScheduledSessions({
        startDate: key,
        endDate: key,
      })
      setSessions(
        sortScheduledSessions(rows.map(normalizeScheduledSession).filter(Boolean)),
      )
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadToday()
  }, [loadToday, refreshSignal])

  useEffect(() => {
    const refetchOnFocus = () => {
      if (document.visibilityState === 'visible') {
        loadToday()
      }
    }

    document.addEventListener('visibilitychange', refetchOnFocus)
    window.addEventListener('focus', loadToday)

    return () => {
      document.removeEventListener('visibilitychange', refetchOnFocus)
      window.removeEventListener('focus', loadToday)
    }
  }, [loadToday])

  const todayItems = useMemo(
    () => appointmentsOnDate(sessions, todayKey()),
    [sessions],
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

      {loading ? null : todayItems.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled today"
          description="Your calendar is clear for today."
          actionLabel="View week"
          onAction={onOpenCalendar}
        />
      ) : (
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
                <div className="coach-today-quick-actions">
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={() => onOpenClient?.(client)}
                  >
                    Open client
                  </button>
                  {client?.athlete_id ? (
                    <button
                      type="button"
                      className="coach-secondary-button"
                      onClick={() =>
                        onOpenClientSection?.(client, 'training')
                      }
                    >
                      Training
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={() =>
                      onOpenClientSection?.(client, 'sessions')
                    }
                  >
                    Passes
                  </button>
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={() => onOpenClientSection?.(client, 'notes')}
                  >
                    Notes
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
