import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { appointmentLinkageUserMessage } from '../lib/coachBusinessClientLinkage'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import {
  addDaysKey,
  dateKey as scheduleDateKey,
  formatScheduleDateLong,
  formatTime12Hour,
  isScheduleTimeInPast,
} from '../lib/appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from '../lib/sessionTimezone'
import {
  logAppointmentCreate,
  logCoachCreateCheckpoint,
} from '../lib/athleteAppointmentTrace'
import {
  normalizeScheduledSession,
  sortScheduledSessions,
} from '../lib/coachScheduledSessions'
import CoachPassSelectionModal from './coach/CoachPassSelectionModal'
import CoachMissedChargeSheet from './coach/CoachMissedChargeSheet'
import CoachSessionDetailSheet from './coach/CoachSessionDetailSheet'
import EmptyState from './ui/EmptyState'
import CoachAppointmentCard from './coach/CoachAppointmentCard'
import CoachScheduleSessionSheet from './CoachScheduleSessionSheet'
import { getClientDisplayName } from '../lib/clientDisplayName'
import { useCoachSessionDetail } from '../hooks/useCoachSessionDetail'
import {
  formatCoachCalendarEmptyHint,
  partitionCoachCalendarAppointments,
  appointmentsOnSelectedDay,
} from '../lib/coachingAppointment'
import {
  buildCoachRsvpAlert,
  isRsvpException,
  rsvpCoachLabel,
  sortSessionsForCoachToday,
} from '../lib/sessionRsvp'

const ICON = { size: 18, strokeWidth: 1.75 }
const DAY_MS = 86400000
const UPCOMING_HORIZON_DAYS = 56

const dateKey = (date) => scheduleDateKey(date, DEFAULT_COACH_SCHEDULE_TIMEZONE)
const mondayOf = (input) => {
  const date = new Date(input)
  date.setHours(12, 0, 0, 0)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date
}
const addDays = (date, days) =>
  new Date(new Date(date).getTime() + days * DAY_MS)

export default function CoachSessionCalendar({
  clients = [],
  assignments = [],
  coachEmail = 'Coach',
  onOpenClientProfile,
  initialClientId = '',
  initialOpenComposer = false,
  onComposerOpened,
}) {
  const [anchor, setAnchor] = useState(new Date())
  const [selectedDayKey, setSelectedDayKey] = useState(() => dateKey(new Date()))
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(initialOpenComposer)
  const [scheduling, setScheduling] = useState(false)
  const [draft, setDraft] = useState({
    athleteId: initialClientId,
    sessionDate: dateKey(new Date()),
    startTime: '09:00',
    durationMinutes: '60',
    coachNote: '',
    assignmentId: null,
    locationType: 'default',
    locationName: '',
    assignments: [],
  })

  useEffect(() => {
    if (!initialOpenComposer) return
    setShowComposer(true)
    onComposerOpened?.()
  }, [initialOpenComposer, onComposerOpened])

  const openScheduleComposer = () => {
    setShowComposer(true)
  }

  const weekStart = useMemo(() => mondayOf(anchor), [anchor])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )
  const todayKey = dateKey(new Date())

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await coachBackend.listScheduledSessions({
        startDate: dateKey(weekDays[0]),
        endDate: addDaysKey(dateKey(weekDays[0]), UPCOMING_HORIZON_DAYS),
      })
      setSessions(rows.map(normalizeScheduledSession).filter(Boolean))
    } catch (error) {
      if (!/coach_scheduled_sessions|migration|does not exist/i.test(error.message ?? '')) {
        appUi.toast(error.message ?? 'Could not load sessions.', 'error')
      }
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [weekDays])

  useEffect(() => {
    setSelectedDayKey((current) =>
      weekDays.some((day) => dateKey(day) === current) ? current : todayKey,
    )
  }, [weekDays, todayKey])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    const refetchOnFocus = () => {
      if (document.visibilityState === 'visible') {
        loadSessions()
      }
    }

    document.addEventListener('visibilitychange', refetchOnFocus)
    window.addEventListener('focus', loadSessions)

    return () => {
      document.removeEventListener('visibilitychange', refetchOnFocus)
      window.removeEventListener('focus', loadSessions)
    }
  }, [loadSessions])

  const sessionDetail = useCoachSessionDetail({
    clients,
    assignments,
    onOpenClientProfile,
    sessions,
    setSessions,
    onLoadSessions: loadSessions,
  })

  useEffect(() => {
    if (!draft.athleteId) {
      setDraft((current) => ({ ...current, assignments: [] }))
      return
    }

    setDraft((current) => ({
      ...current,
      assignments: assignments.filter(
        (item) =>
          item.athlete_id === draft.athleteId &&
          ['assigned', 'started'].includes(item.status),
      ),
    }))
  }, [draft.athleteId, assignments])

  const clientByAthleteId = useMemo(
    () =>
      Object.fromEntries(
        clients.map((client) => [client.athlete_id, client]),
      ),
    [clients],
  )

  const sortedSessions = useMemo(
    () => sortScheduledSessions(sessions),
    [sessions],
  )

  const weekStartKey = dateKey(weekDays[0])

  const calendarPartitions = useMemo(
    () =>
      partitionCoachCalendarAppointments(sortedSessions, {
        todayKey,
        weekStartKey,
      }),
    [sortedSessions, todayKey, weekStartKey],
  )

  const selectedDaySessions = useMemo(
    () => appointmentsOnSelectedDay(sortedSessions, selectedDayKey),
    [sortedSessions, selectedDayKey],
  )

  const todaySessions = useMemo(
    () => sortSessionsForCoachToday(calendarPartitions.today),
    [calendarPartitions.today],
  )

  const emptyHint = useMemo(
    () => formatCoachCalendarEmptyHint(sortedSessions),
    [sortedSessions],
  )

  const todayRsvpAlerts = useMemo(
    () =>
      todaySessions
        .filter(isRsvpException)
        .map((session) => ({
          id: session.id,
          message: buildCoachRsvpAlert(
            session,
            getClientDisplayName(clientByAthleteId[session.athleteId] ?? {}),
          ),
        }))
        .filter((entry) => entry.message),
    [todaySessions, clientByAthleteId],
  )

  const jumpToToday = () => {
    const now = new Date()
    setAnchor(now)
    setSelectedDayKey(dateKey(now))
  }

  const renderDayGroup = ({ date, items }) => {
    const label = new Date(`${date}T12:00:00`).toLocaleDateString([], {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })

    return (
      <div key={date} className="coach-session-calendar-day-group">
        <h4>{label}</h4>
        <div className="coach-session-calendar-list">
          {items.map((session) => (
            <CoachAppointmentCard
              key={session.id}
              session={session}
              client={clientByAthleteId[session.athleteId]}
              onClick={sessionDetail.openSession}
            />
          ))}
        </div>
      </div>
    )
  }

  const handleSchedule = async () => {
    if (!draft.athleteId) {
      appUi.toast('Select a client.', 'error')
      return
    }

    if (
      isScheduleTimeInPast({
        sessionDate: draft.sessionDate,
        startTime: draft.startTime,
        scheduleTimezone: DEFAULT_COACH_SCHEDULE_TIMEZONE,
      })
    ) {
      appUi.toast('That time has already passed.', 'error')
      return
    }

    setScheduling(true)

    const scheduledDate = draft.sessionDate
    const scheduledTime = draft.startTime

    try {
      const selectedClient = clientByAthleteId[draft.athleteId]
      const created = await coachBackend.createScheduledSession({
        athleteId: draft.athleteId,
        businessClientId:
          selectedClient?.business_client_id ??
          selectedClient?.businessClientId ??
          null,
        sessionDate: scheduledDate,
        startTime: scheduledTime,
        durationMinutes: draft.durationMinutes
          ? Number(draft.durationMinutes)
          : null,
        coachNote: draft.coachNote.trim(),
        assignmentId: draft.assignmentId ?? null,
        locationType: draft.locationType ?? 'default',
        locationName: draft.locationName ?? '',
        existingSessions: sessions,
      })
      setShowComposer(false)
      setDraft((current) => ({
        ...current,
        coachNote: '',
        sessionDate: dateKey(new Date()),
        startTime: '09:00',
        durationMinutes: '60',
        assignmentId: null,
      }))
      appUi.toast(
        `Session scheduled · ${formatScheduleDateLong(scheduledDate)} · ${formatTime12Hour(scheduledTime)}`,
        'success',
      )
      const normalized = normalizeScheduledSession(created)
      logAppointmentCreate({
        success: true,
        selectedLocalDate: scheduledDate,
        selectedLocalTime: scheduledTime,
        timezone: DEFAULT_COACH_SCHEDULE_TIMEZONE,
        row: created,
      })
      logCoachCreateCheckpoint(created, { expectedAthleteId: draft.athleteId })
      if (normalized) {
        setSessions((current) => sortScheduledSessions([...current, normalized]))
      }
      await loadSessions()
    } catch (error) {
      logAppointmentCreate({
        success: false,
        selectedLocalDate: scheduledDate,
        selectedLocalTime: scheduledTime,
        timezone: DEFAULT_COACH_SCHEDULE_TIMEZONE,
        error,
      })
      appUi.toast(
        appointmentLinkageUserMessage(error.message) ??
          error.message ??
          'Could not schedule session.',
        'error',
      )
    } finally {
      setScheduling(false)
    }
  }

  const selectedDayLabel = useMemo(() => {
    const date = new Date(`${selectedDayKey}T12:00:00`)
    return date.toLocaleDateString([], {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  }, [selectedDayKey])

  return (
    <section className="coach-session-calendar-screen">
      <header className="coach-session-calendar-header">
        <div>
          <span className="eyebrow">COACH CALENDAR</span>
          <h2>Training sessions</h2>
          <p>Today first — in-person sessions stay separate from workout assignments.</p>
        </div>
        <button
          type="button"
          className="gold-button machined coach-primary-action"
          data-testid="coach-schedule-session-button"
          onClick={openScheduleComposer}
        >
          <Plus {...ICON} />
          Schedule Session
        </button>
      </header>

      <div className="coach-session-calendar-nav">
        <div className="coach-session-calendar-toolbar">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setAnchor(addDays(anchor, -7))}
          >
            <ChevronLeft {...ICON} />
          </button>
          <strong>{selectedDayLabel}</strong>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setAnchor(addDays(anchor, 7))}
          >
            <ChevronRight {...ICON} />
          </button>
        </div>
        <button
          type="button"
          className="coach-secondary-button coach-session-calendar-today"
          onClick={jumpToToday}
        >
          Today
        </button>
      </div>

      <div className="coach-session-calendar-week-strip" role="tablist" aria-label="Week days">
        {weekDays.map((day) => {
          const key = dateKey(day)
          const isSelected = key === selectedDayKey
          const isToday = key === todayKey

          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`coach-session-calendar-day-chip${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
              onClick={() => setSelectedDayKey(key)}
            >
              <span>{day.toLocaleDateString([], { weekday: 'short' })}</span>
              <strong>{day.getDate()}</strong>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p>Loading sessions…</p>
      ) : (
        <>
          {selectedDayKey === todayKey ? (
            <section className="coach-session-calendar-day-block">
              <header>
                <span className="eyebrow">TODAY</span>
                <h3>{selectedDayLabel}</h3>
              </header>
              {todayRsvpAlerts.length > 0 && (
                <div className="coach-session-rsvp-alerts" role="status">
                  {todayRsvpAlerts.map((alert) => (
                    <p key={alert.id}>{alert.message}</p>
                  ))}
                </div>
              )}
              {todaySessions.length ? (
                <div className="coach-session-calendar-list">
                  {todaySessions.map((session) => (
                    <CoachAppointmentCard
                      key={session.id}
                      session={session}
                      client={clientByAthleteId[session.athleteId]}
                      onClick={sessionDetail.openSession}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="No sessions today"
                  description={
                    emptyHint ??
                    'Schedule an in-person session when you are ready.'
                  }
                />
              )}
            </section>
          ) : (
            <section className="coach-session-calendar-day-block">
              <header>
                <span className="eyebrow">SELECTED DAY</span>
                <h3>{selectedDayLabel}</h3>
              </header>
              {selectedDaySessions.length ? (
                <div className="coach-session-calendar-list">
                  {selectedDaySessions.map((session) => (
                    <CoachAppointmentCard
                      key={session.id}
                      session={session}
                      client={clientByAthleteId[session.athleteId]}
                      onClick={sessionDetail.openSession}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="No sessions this day"
                  description="Choose another day or schedule a new session."
                />
              )}
            </section>
          )}

          {calendarPartitions.thisWeekByDay.length > 0 && (
            <section className="coach-session-calendar-day-block">
              <header>
                <span className="eyebrow">THIS WEEK</span>
                <h3>Later this week</h3>
              </header>
              {calendarPartitions.thisWeekByDay.map(renderDayGroup)}
            </section>
          )}

          {calendarPartitions.upcomingByDay.length > 0 && (
            <section className="coach-session-calendar-day-block">
              <header>
                <span className="eyebrow">UPCOMING</span>
                <h3>Future sessions</h3>
              </header>
              {calendarPartitions.upcomingByDay.map(renderDayGroup)}
            </section>
          )}
        </>
      )}

      <CoachScheduleSessionSheet
        open={showComposer}
        clients={clients}
        draft={draft}
        onDraftChange={setDraft}
        onClose={() => setShowComposer(false)}
        onSubmit={handleSchedule}
        submitting={scheduling}
        scheduleTimezone={DEFAULT_COACH_SCHEDULE_TIMEZONE}
      />

      <CoachSessionDetailSheet
        open={Boolean(sessionDetail.activeSession)}
        session={sessionDetail.activeSession}
        client={sessionDetail.activeClient}
        assignments={sessionDetail.assignments}
        passSummary={sessionDetail.activePassSummary}
        onClose={sessionDetail.closeDetail}
        rescheduleMode={sessionDetail.rescheduleMode}
        rescheduleDraft={sessionDetail.rescheduleDraft}
        onRescheduleDraftChange={sessionDetail.setRescheduleDraft}
        onBeginReschedule={sessionDetail.beginReschedule}
        onSaveReschedule={sessionDetail.saveReschedule}
        onViewClient={sessionDetail.handleViewClient}
        onComplete={sessionDetail.handleComplete}
        onApplyPassDebit={sessionDetail.handleApplyPassDebit}
        onCancel={sessionDetail.handleCancel}
        onMarkMissed={sessionDetail.handleMarkMissed}
        completingSessionId={sessionDetail.completingSessionId}
        passDebitState={sessionDetail.passDebitState}
        passActionBusy={sessionDetail.passActionBusy}
      />

      <CoachPassSelectionModal
        open={Boolean(sessionDetail.passSelection)}
        title={
          sessionDetail.passSelection?.mode === 'complete'
            ? 'Which pass should this session use?'
            : 'Choose a training pass'
        }
        description={
          sessionDetail.passSelection?.mode === 'complete'
            ? 'This session is complete. Select the pass that should receive the debit.'
            : 'This client has more than one eligible pass. Select which pass should receive this debit.'
        }
        candidates={sessionDetail.passSelection?.candidates ?? []}
        submitting={sessionDetail.passActionBusy}
        onClose={sessionDetail.closePassSelection}
        onSelect={sessionDetail.handlePassSelection}
      />

      <CoachMissedChargeSheet
        open={Boolean(sessionDetail.missedChargeSession)}
        submitting={sessionDetail.passActionBusy}
        onClose={() => sessionDetail.setMissedChargeSession(null)}
        onNoCharge={sessionDetail.handleMissedNoCharge}
        onCharge={sessionDetail.handleMissedCharge}
      />
    </section>
  )
}
