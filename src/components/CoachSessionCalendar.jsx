import {
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { appointmentLinkageUserMessage } from '../lib/coachBusinessClientLinkage'
import {
  COACH_CALENDAR_VIEW,
  appointmentsForCoachDayAgenda,
  countActiveAppointmentsByDay,
  formatCoachCalendarDayHeading,
  formatCoachCalendarWeekHeading,
  identifyNextCoachAppointment,
  isPastCoachAppointment,
} from '../lib/coachCalendarUi'
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
import RecurrenceScopeDialog from './coach/RecurrenceScopeDialog'
import CoachSessionDetailSheet from './coach/CoachSessionDetailSheet'
import CoachAppointmentCard from './coach/CoachAppointmentCard'
import CoachScheduleSessionSheet from './CoachScheduleSessionSheet'
import { getClientDisplayName } from '../lib/clientDisplayName'
import { useCoachSessionDetail } from '../hooks/useCoachSessionDetail'
import { formatCoachCalendarEmptyHint } from '../lib/coachingAppointment'
import {
  emptyRecurrenceDraft,
  RECURRENCE_END,
  resolveRecurrenceWeekdays,
  validateRecurrenceDraft,
} from '../lib/recurringAppointments'
import {
  buildCoachRsvpAlert,
  isRsvpException,
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
  onScheduleComplete,
  initialFocusedSessionId = null,
  onFocusedSessionOpened,
}) {
  const [viewMode, setViewMode] = useState(COACH_CALENDAR_VIEW.TODAY)
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
    recurrence: emptyRecurrenceDraft(),
  })

  useEffect(() => {
    if (!initialClientId) return
    setDraft((current) => ({
      ...current,
      athleteId: initialClientId,
    }))
  }, [initialClientId])

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
  const weekDayKeys = useMemo(
    () => weekDays.map((day) => dateKey(day)),
    [weekDays],
  )
  const todayKey = dateKey(new Date())
  const now = useMemo(() => new Date(), [sessions, selectedDayKey, todayKey])

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
      weekDayKeys.includes(current) ? current : todayKey,
    )
  }, [weekDayKeys, todayKey])

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
    if (!initialFocusedSessionId || loading) return

    const session = sessions.find((entry) => entry.id === initialFocusedSessionId)
    if (!session) return

    sessionDetail.openSession(session)
    onFocusedSessionOpened?.()
  }, [
    initialFocusedSessionId,
    loading,
    onFocusedSessionOpened,
    sessionDetail,
    sessions,
  ])

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

  const dayCounts = useMemo(
    () => countActiveAppointmentsByDay(sortedSessions, weekDayKeys),
    [sortedSessions, weekDayKeys],
  )

  const agendaDayKey = selectedDayKey

  const agendaSessions = useMemo(
    () => appointmentsForCoachDayAgenda(sortedSessions, agendaDayKey),
    [sortedSessions, agendaDayKey],
  )

  const nextAppointment = useMemo(
    () =>
      identifyNextCoachAppointment(sortedSessions, {
        now,
        dayKey: agendaDayKey,
      }),
    [sortedSessions, now, agendaDayKey],
  )

  const emptyHint = useMemo(
    () => formatCoachCalendarEmptyHint(sortedSessions),
    [sortedSessions],
  )

  const todayRsvpAlerts = useMemo(
    () =>
      agendaSessions
        .filter(isRsvpException)
        .map((session) => ({
          id: session.id,
          message: buildCoachRsvpAlert(
            session,
            getClientDisplayName(clientByAthleteId[session.athleteId] ?? {}),
          ),
        }))
        .filter((entry) => entry.message),
    [agendaSessions, clientByAthleteId],
  )

  const jumpToToday = () => {
    const current = new Date()
    setAnchor(current)
    setSelectedDayKey(dateKey(current))
    setViewMode(COACH_CALENDAR_VIEW.TODAY)
  }

  const shiftSelectedDay = (delta) => {
    const nextKey = addDaysKey(selectedDayKey, delta)
    setSelectedDayKey(nextKey)
    setAnchor(new Date(`${nextKey}T12:00:00`))
  }

  const renderAgendaList = (items, { dayKey = agendaDayKey } = {}) => {
    if (!items.length) {
      return (
        <div className="coach-session-calendar-empty">
          <p>Nothing scheduled {dayKey === todayKey ? 'today' : 'this day'}</p>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            onClick={openScheduleComposer}
          >
            Schedule appointment
          </button>
        </div>
      )
    }

    return (
      <div className="coach-session-calendar-list">
        {items.map((session) => (
          <CoachAppointmentCard
            key={session.id}
            session={session}
            client={clientByAthleteId[session.athleteId]}
            onClick={sessionDetail.openSession}
            isPast={isPastCoachAppointment(session, now)}
            isNext={nextAppointment?.id === session.id}
          />
        ))}
      </div>
    )
  }

  const handleSchedule = async () => {
    if (!draft.athleteId) {
      appUi.toast('Select a client.', 'error')
      return
    }

    const recurrenceError = validateRecurrenceDraft(
      draft.recurrence ?? emptyRecurrenceDraft(),
      draft.sessionDate,
    )
    if (recurrenceError) {
      appUi.toast(recurrenceError, 'error')
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

      if (draft.recurrence?.enabled) {
        const weekdays = resolveRecurrenceWeekdays({
          mode: draft.recurrence.mode,
          weekdays: draft.recurrence.weekdays,
          startsOn: draft.sessionDate,
        })

        await coachBackend.createRecurringAppointmentSeries({
          businessClientId:
            selectedClient?.business_client_id ??
            selectedClient?.businessClientId ??
            null,
          startsOn: draft.sessionDate,
          startTime: draft.startTime,
          durationMinutes: draft.durationMinutes
            ? Number(draft.durationMinutes)
            : 60,
          weekdays,
          endsOn:
            draft.recurrence.endType === RECURRENCE_END.ON_DATE
              ? draft.recurrence.endsOn
              : null,
          occurrenceLimit:
            draft.recurrence.endType === RECURRENCE_END.AFTER_COUNT
              ? Number(draft.recurrence.occurrenceLimit)
              : null,
          scheduleTimezone: DEFAULT_COACH_SCHEDULE_TIMEZONE,
          coachNote: draft.coachNote.trim(),
          assignmentId: draft.assignmentId ?? null,
          locationType: draft.locationType ?? 'default',
          locationName: draft.locationName ?? '',
        })
      } else {
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
        logAppointmentCreate({
          success: true,
          selectedLocalDate: scheduledDate,
          selectedLocalTime: scheduledTime,
          timezone: DEFAULT_COACH_SCHEDULE_TIMEZONE,
          row: created,
        })
        logCoachCreateCheckpoint(created, { expectedAthleteId: draft.athleteId })
      }

      setShowComposer(false)
      setDraft((current) => ({
        ...current,
        coachNote: '',
        sessionDate: dateKey(new Date()),
        startTime: '09:00',
        durationMinutes: '60',
        assignmentId: null,
        recurrence: emptyRecurrenceDraft(),
      }))
      appUi.toast(
        draft.recurrence?.enabled
          ? 'Recurring appointments saved.'
          : `Session scheduled · ${formatScheduleDateLong(scheduledDate)} · ${formatTime12Hour(scheduledTime)}`,
        'success',
      )
      await loadSessions()
      setSelectedDayKey(scheduledDate)
      setAnchor(new Date(`${scheduledDate}T12:00:00`))
      onScheduleComplete?.()
    } catch (error) {
      logAppointmentCreate({
        success: false,
        selectedLocalDate: scheduledDate,
        selectedLocalTime: scheduledTime,
        timezone: DEFAULT_COACH_SCHEDULE_TIMEZONE,
        error,
      })
      appUi.toast(
        error.message ??
          appointmentLinkageUserMessage(error.message) ??
          'Could not schedule session.',
        'error',
      )
    } finally {
      setScheduling(false)
    }
  }

  const dayHeading = formatCoachCalendarDayHeading(agendaDayKey)
  const weekHeading = formatCoachCalendarWeekHeading(dateKey(weekDays[0]))

  return (
    <section className="coach-session-calendar-screen">
      <header className="coach-session-calendar-header">
        <div className="coach-session-calendar-title-row">
          <h1>Calendar</h1>
          <button
            type="button"
            className="gold-button machined coach-primary-action coach-session-calendar-schedule"
            data-testid="coach-schedule-session-button"
            onClick={openScheduleComposer}
          >
            <Plus {...ICON} />
            Schedule
          </button>
        </div>

        <div
          className="coach-session-calendar-view-toggle"
          role="tablist"
          aria-label="Calendar view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === COACH_CALENDAR_VIEW.TODAY}
            className={viewMode === COACH_CALENDAR_VIEW.TODAY ? 'active' : ''}
            data-testid="coach-calendar-view-today"
            onClick={() => {
              setViewMode(COACH_CALENDAR_VIEW.TODAY)
              setSelectedDayKey(todayKey)
              setAnchor(new Date())
            }}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === COACH_CALENDAR_VIEW.WEEK}
            className={viewMode === COACH_CALENDAR_VIEW.WEEK ? 'active' : ''}
            data-testid="coach-calendar-view-week"
            onClick={() => setViewMode(COACH_CALENDAR_VIEW.WEEK)}
          >
            Week
          </button>
        </div>
      </header>

      {viewMode === COACH_CALENDAR_VIEW.TODAY ? (
        <div className="coach-session-calendar-nav">
          <div className="coach-session-calendar-toolbar">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => shiftSelectedDay(-1)}
            >
              <ChevronLeft {...ICON} />
            </button>
            <strong>{dayHeading}</strong>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => shiftSelectedDay(1)}
            >
              <ChevronRight {...ICON} />
            </button>
          </div>
          {selectedDayKey !== todayKey ? (
            <button
              type="button"
              className="coach-secondary-button coach-session-calendar-today"
              data-testid="coach-calendar-jump-today"
              onClick={jumpToToday}
            >
              Today
            </button>
          ) : null}
        </div>
      ) : (
        <div className="coach-session-calendar-nav">
          <div className="coach-session-calendar-toolbar">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => setAnchor(addDays(anchor, -7))}
            >
              <ChevronLeft {...ICON} />
            </button>
            <strong>{weekHeading}</strong>
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
            data-testid="coach-calendar-jump-today"
            onClick={jumpToToday}
          >
            Today
          </button>
        </div>
      )}

      {viewMode === COACH_CALENDAR_VIEW.WEEK ? (
        <div
          className="coach-session-calendar-week-strip"
          role="tablist"
          aria-label="Week days"
        >
          {weekDays.map((day) => {
            const key = dateKey(day)
            const isSelected = key === selectedDayKey
            const isToday = key === todayKey
            const count = dayCounts[key] ?? 0

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
                <em>{count ? `${count} session${count === 1 ? '' : 's'}` : 'Open'}</em>
              </button>
            )
          })}
        </div>
      ) : null}

      {loading ? (
        <p className="coach-session-calendar-loading">Loading sessions…</p>
      ) : (
        <section className="coach-session-calendar-day-block">
          <header className="coach-session-calendar-day-heading">
            <h2>{dayHeading}</h2>
          </header>

          {viewMode === COACH_CALENDAR_VIEW.TODAY &&
          agendaDayKey === todayKey &&
          todayRsvpAlerts.length > 0 ? (
            <div className="coach-session-rsvp-alerts" role="status">
              {todayRsvpAlerts.map((alert) => (
                <p key={alert.id}>{alert.message}</p>
              ))}
            </div>
          ) : null}

          {renderAgendaList(agendaSessions, { dayKey: agendaDayKey })}

          {viewMode === COACH_CALENDAR_VIEW.TODAY &&
          !agendaSessions.length &&
          emptyHint ? (
            <p className="coach-session-calendar-hint">{emptyHint}</p>
          ) : null}
        </section>
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

      <RecurrenceScopeDialog
        open={Boolean(sessionDetail.recurrenceScopePrompt)}
        title={
          sessionDetail.recurrenceScopePrompt?.action === 'cancel'
            ? 'Cancel recurring appointment'
            : 'Apply schedule changes to'
        }
        description={
          sessionDetail.recurrenceScopePrompt?.action === 'cancel'
            ? 'Choose whether to cancel only this session or the rest of the series.'
            : 'This and future updates time and duration only. Past appointments stay unchanged.'
        }
        onClose={() => sessionDetail.setRecurrenceScopePrompt(null)}
        onSelect={sessionDetail.applyRecurrenceScope}
      />
    </section>
  )
}
