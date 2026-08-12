import { CalendarDays } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../../lib/coachBackend'
import { appointmentsOnDate } from '../../lib/coachingAppointment'
import {
  normalizeScheduledSession,
  sortScheduledSessions,
} from '../../lib/coachScheduledSessions'
import CoachAppointmentCard from './CoachAppointmentCard'
import EmptyState from '../ui/EmptyState'

const todayKey = () => new Date().toISOString().slice(0, 10)

export default function CoachTodaySchedule({
  clients = [],
  onSchedule,
  onOpenCalendar,
  onOpenClient,
  onOpenSession,
  refreshSignal = 0,
}) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  const clientByAthleteId = useMemo(
    () => Object.fromEntries(clients.map((client) => [client.athlete_id, client])),
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
          title="No in-person sessions today"
          description="Your roster is clear for today."
          actionLabel="View week"
          onAction={onOpenCalendar}
        />
      ) : (
        <ul className="coach-today-schedule-list">
          {todayItems.map((item) => (
            <li key={item.id}>
              <CoachAppointmentCard
                session={item}
                client={clientByAthleteId[item.athleteId] ?? null}
                className="coach-today-schedule-card"
                onClick={(session) => {
                  if (onOpenSession) {
                    onOpenSession(session)
                    return
                  }
                  onOpenClient?.(clientByAthleteId[session.athleteId] ?? null)
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
