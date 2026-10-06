import {
  CalendarClock,
  ChevronDown,
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
  buildCoachMonthDays,
  formatCoachCalendarDayHeading,
  formatCoachCalendarMonthHeading,
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
import CoachCalendarEventSheet from './CoachCalendarEventSheet'
import { getClientDisplayName } from '../lib/clientDisplayName'
import {
  resolveAthleteDataId,
  resolveRecordBusinessClientId,
} from '../lib/coachBusinessClient'
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
import {
  COACH_CALENDAR_EVENT_CATEGORY,
  COACH_CALENDAR_EVENT_CATEGORY_LABEL,
  coachCalendarEventCategoryLabel,
  createCoachCalendarEventDraft,
  normalizeCoachCalendarEvent,
} from '../lib/coachCalendarEvents'
import {
  ATHLETE_CALENDAR_EVENT_CATEGORY,
  ATHLETE_CALENDAR_EVENT_CATEGORY_LABEL,
  athleteCalendarBackend,
  athleteCalendarEventCategoryLabel,
  normalizeAthleteCalendarEvent,
} from '../lib/athleteCalendarEvents'

const ICON = { size: 18, strokeWidth: 1.75 }
const DAY_MS = 86400000
const UPCOMING_HORIZON_DAYS = 84

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
  const [viewMode, setViewMode] = useState(COACH_CALENDAR_VIEW.MONTH)
  const [anchor, setAnchor] = useState(new Date())
  const [selectedDayKey, setSelectedDayKey] = useState(() => dateKey(new Date()))
  const [sessions, setSessions] = useState([])
  const [calendarEvents, setCalendarEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(initialOpenComposer)
  const [showEventComposer, setShowEventComposer] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [eventSaving, setEventSaving] = useState(false)
  const [editingPrivateEvent, setEditingPrivateEvent] = useState(null)
  const [eventDraft, setEventDraft] = useState(() =>
    createCoachCalendarEventDraft(dateKey(new Date())),
  )
  const [draft, setDraft] = useState({
    athleteId: '',
    businessClientId: '',
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
    const client = clients.find((entry) => {
      const businessClientId = resolveRecordBusinessClientId(entry)
      const athleteId = resolveAthleteDataId(entry)
      return (
        String(businessClientId ?? '') === String(initialClientId) ||
        String(athleteId ?? '') === String(initialClientId)
      )
    })
    if (!client) return

    setDraft((current) => ({
      ...current,
      businessClientId: resolveRecordBusinessClientId(client) ?? '',
      athleteId: resolveAthleteDataId(client) ?? '',
    }))
  }, [initialClientId, clients])

  useEffect(() => {
    if (!initialOpenComposer) return
    setShowComposer(true)
    onComposerOpened?.()
  }, [initialOpenComposer, onComposerOpened])

  const openScheduleComposer = () => {
    setShowAddMenu(false)
    setShowComposer(true)
  }

  const openPrivateEventComposer = () => {
    setShowAddMenu(false)
    setEditingPrivateEvent(null)
    setEventDraft(createCoachCalendarEventDraft(selectedDayKey))
    setShowEventComposer(true)
  }

  const openPrivateEventEditor = (event) => {
    setEditingPrivateEvent(event)
    setEventDraft({
      title: event.title ?? '',
      eventDate: event.eventDate ?? event.sessionDate ?? selectedDayKey,
      startTime: String(event.startTime ?? '').slice(0, 5),
      durationMinutes: String(event.durationMinutes ?? 60),
      category:
        event.category ??
        (event.isAthletePrivateEvent
          ? ATHLETE_CALENDAR_EVENT_CATEGORY.PERSONAL
          : COACH_CALENDAR_EVENT_CATEGORY.PERSONAL),
      locationName: event.locationName ?? '',
      notes: event.notes ?? '',
    })
    setShowEventComposer(true)
  }

  const weekStart = useMemo(() => mondayOf(anchor), [anchor])
  const monthDays = useMemo(() => buildCoachMonthDays(anchor), [anchor])
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
    const startDate = dateKey(addDays(anchor, -42))
    const endDate = addDaysKey(startDate, 168)
    try {
      const [sessionRows, eventRows, personalRows] = await Promise.all([
        coachBackend.listScheduledSessions({ startDate, endDate }),
        coachBackend.listCoachCalendarEvents({ startDate, endDate }),
        athleteCalendarBackend.list({ startDate, endDate }),
      ])
      setSessions(sessionRows.map(normalizeScheduledSession).filter(Boolean))
      setCalendarEvents([
        ...eventRows.map(normalizeCoachCalendarEvent).filter(Boolean),
        ...personalRows.map(normalizeAthleteCalendarEvent).filter(Boolean),
      ])
    } catch (error) {
      if (
        !/coach_scheduled_sessions|coach_calendar_events|migration|does not exist/i.test(
          error.message ?? '',
        )
      ) {
        appUi.toast(error.message ?? 'Could not load calendar.', 'error')
      }
      setSessions([])
      setCalendarEvents([])
    } finally {
      setLoading(false)
    }
  }, [anchor])

  useEffect(() => {
    if (viewMode !== COACH_CALENDAR_VIEW.WEEK) return
    setSelectedDayKey((current) =>
      weekDayKeys.includes(current) ? current : dateKey(anchor),
    )
  }, [anchor, viewMode, weekDayKeys])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    const refreshFromAva = () => {
      void loadSessions()
    }

    window.addEventListener('avaren:coach-calendar-updated', refreshFromAva)
    return () => {
      window.removeEventListener('avaren:coach-calendar-updated', refreshFromAva)
    }
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
    calendarItems: calendarEvents,
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
        clients
          .map((client) => [resolveAthleteDataId(client), client])
          .filter(([athleteId]) => Boolean(athleteId)),
      ),
    [clients],
  )

  const clientByBusinessClientId = useMemo(
    () =>
      Object.fromEntries(
        clients
          .map((client) => [resolveRecordBusinessClientId(client), client])
          .filter(([businessClientId]) => Boolean(businessClientId)),
      ),
    [clients],
  )

  const resolveClientForSession = useCallback(
    (session) =>
      clientByBusinessClientId[session?.businessClientId] ??
      clientByAthleteId[session?.athleteId] ??
      null,
    [clientByBusinessClientId, clientByAthleteId],
  )

  const sortedSessions = useMemo(
    () => sortScheduledSessions(sessions),
    [sessions],
  )

  const scheduleItems = useMemo(
    () => sortScheduledSessions([...sessions, ...calendarEvents]),
    [sessions, calendarEvents],
  )

  const dayCounts = useMemo(
    () => countActiveAppointmentsByDay(scheduleItems, weekDayKeys),
    [scheduleItems, weekDayKeys],
  )

  const agendaDayKey = selectedDayKey

  const agendaSessions = useMemo(
    () => appointmentsForCoachDayAgenda(scheduleItems, agendaDayKey),
    [scheduleItems, agendaDayKey],
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
            getClientDisplayName(resolveClientForSession(session) ?? {}),
          ),
        }))
        .filter((entry) => entry.message),
    [agendaSessions, resolveClientForSession],
  )

  const jumpToToday = () => {
    const current = new Date()
    setAnchor(current)
    setSelectedDayKey(dateKey(current))
    setViewMode(COACH_CALENDAR_VIEW.DAY)
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
        {items.map((session) =>
          session.isCoachPrivateEvent || session.isAthletePrivateEvent ? (
            <button
              key={session.id}
              type="button"
              className="coach-calendar-private-event"
              data-testid="coach-private-calendar-event"
              onClick={() => openPrivateEventEditor(session)}
            >
              <div>
                <strong>
                  {formatTime12Hour(session.startTime)} · {session.title}
                </strong>
                <span>
                  {session.isAthletePrivateEvent
                    ? athleteCalendarEventCategoryLabel(session)
                    : coachCalendarEventCategoryLabel(session)}
                  {session.locationName ? ` · ${session.locationName}` : ''}
                </span>
              </div>
              <em>Private</em>
            </button>
          ) : (
            <CoachAppointmentCard
              key={session.id}
              session={session}
              client={resolveClientForSession(session)}
              onClick={sessionDetail.openSession}
              isPast={isPastCoachAppointment(session, now)}
              isNext={nextAppointment?.id === session.id}
            />
          ),
        )}
      </div>
    )
  }

  const handleSchedule = async () => {
    if (!draft.businessClientId) {
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
      const selectedClient =
        clientByBusinessClientId[draft.businessClientId] ??
        clientByAthleteId[draft.athleteId] ??
        null

      if (draft.recurrence?.enabled) {
        const weekdays = resolveRecurrenceWeekdays({
          mode: draft.recurrence.mode,
          weekdays: draft.recurrence.weekdays,
          startsOn: draft.sessionDate,
        })

        await coachBackend.createRecurringAppointmentSeries({
          businessClientId:
            resolveRecordBusinessClientId(selectedClient) ??
            draft.businessClientId ??
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
          existingItems: scheduleItems,
        })
      } else {
        const created = await coachBackend.createScheduledSession({
          athleteId: resolveAthleteDataId(selectedClient) ?? null,
          businessClientId:
            resolveRecordBusinessClientId(selectedClient) ??
            draft.businessClientId ??
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
          existingSessions: scheduleItems,
        })
        logAppointmentCreate({
          success: true,
          selectedLocalDate: scheduledDate,
          selectedLocalTime: scheduledTime,
          timezone: DEFAULT_COACH_SCHEDULE_TIMEZONE,
          row: created,
        })
        if (draft.athleteId) {
          logCoachCreateCheckpoint(created, { expectedAthleteId: draft.athleteId })
        }
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

  const handleSavePrivateEvent = async () => {
    const title = eventDraft.title.trim()
    if (!title) {
      appUi.toast('Add a title for this event.', 'error')
      return
    }

    if (
      isScheduleTimeInPast({
        sessionDate: eventDraft.eventDate,
        startTime: eventDraft.startTime,
        scheduleTimezone: DEFAULT_COACH_SCHEDULE_TIMEZONE,
      })
    ) {
      appUi.toast('That time has already passed.', 'error')
      return
    }

    setEventSaving(true)
    try {
      const payload = {
        title,
        eventDate: eventDraft.eventDate,
        startTime: eventDraft.startTime,
        durationMinutes: Number(eventDraft.durationMinutes) || 60,
        category: eventDraft.category,
        notes: eventDraft.notes.trim(),
        locationName: eventDraft.locationName.trim(),
      }

      if (editingPrivateEvent?.isAthletePrivateEvent) {
        await athleteCalendarBackend.update(editingPrivateEvent.id, payload)
      } else if (editingPrivateEvent?.isCoachPrivateEvent) {
        await coachBackend.updateCoachCalendarEvent(
          editingPrivateEvent.id,
          {
            ...payload,
            existingItems: scheduleItems,
          },
        )
      } else {
        await coachBackend.createCoachCalendarEvent({
          ...payload,
          existingItems: scheduleItems,
        })
      }

      setShowEventComposer(false)
      setEditingPrivateEvent(null)
      setSelectedDayKey(eventDraft.eventDate)
      setAnchor(new Date(`${eventDraft.eventDate}T12:00:00`))
      setEventDraft(createCoachCalendarEventDraft(eventDraft.eventDate))
      appUi.toast(
        editingPrivateEvent ? 'Private event updated.' : 'Private calendar event added.',
        'success',
      )
      await loadSessions()
    } catch (error) {
      appUi.toast(
        error.message === 'calendar_overlap'
          ? 'That time overlaps something already on your calendar.'
          : error.message ?? 'Could not add calendar event.',
        'error',
      )
    } finally {
      setEventSaving(false)
    }
  }

  const handleDeletePrivateEvent = async () => {
    if (!editingPrivateEvent) return

    const confirmed = await appUi.confirm({
      message: `Delete “${editingPrivateEvent.title}” from your calendar?`,
      confirmLabel: 'Delete event',
      tone: 'danger',
    })
    if (!confirmed) return

    setEventSaving(true)
    try {
      if (editingPrivateEvent.isAthletePrivateEvent) {
        await athleteCalendarBackend.remove(editingPrivateEvent.id)
      } else {
        await coachBackend.deleteCoachCalendarEvent(editingPrivateEvent.id)
      }
      setShowEventComposer(false)
      setEditingPrivateEvent(null)
      appUi.toast('Private event deleted.', 'success')
      await loadSessions()
    } catch (error) {
      appUi.toast(error.message ?? 'Could not delete event.', 'error')
    } finally {
      setEventSaving(false)
    }
  }

  const dayHeading = formatCoachCalendarDayHeading(agendaDayKey)
  const weekHeading = formatCoachCalendarWeekHeading(dateKey(weekDays[0]))
  const monthHeading = formatCoachCalendarMonthHeading(anchor)

  const shiftMonth = (delta) => {
    const next = new Date(anchor)
    next.setHours(12, 0, 0, 0)
    next.setDate(1)
    next.setMonth(next.getMonth() + delta)
    setAnchor(next)
  }

  const shiftCalendarPeriod = (delta) => {
    if (viewMode === COACH_CALENDAR_VIEW.MONTH) {
      shiftMonth(delta)
      return
    }
    if (viewMode === COACH_CALENDAR_VIEW.WEEK) {
      setAnchor(addDays(anchor, delta * 7))
      return
    }
    shiftSelectedDay(delta)
  }

  const goToTodayInCurrentView = () => {
    const current = new Date()
    setAnchor(current)
    setSelectedDayKey(dateKey(current))
  }

  const periodHeading =
    viewMode === COACH_CALENDAR_VIEW.MONTH
      ? monthHeading
      : viewMode === COACH_CALENDAR_VIEW.WEEK
        ? weekHeading
        : dayHeading

  const previousPeriodLabel =
    viewMode === COACH_CALENDAR_VIEW.MONTH
      ? 'Previous month'
      : viewMode === COACH_CALENDAR_VIEW.WEEK
        ? 'Previous week'
        : 'Previous day'

  const nextPeriodLabel =
    viewMode === COACH_CALENDAR_VIEW.MONTH
      ? 'Next month'
      : viewMode === COACH_CALENDAR_VIEW.WEEK
        ? 'Next week'
        : 'Next day'

  const dayItemsByKey = useMemo(() => {
    const groups = {}
    scheduleItems.forEach((item) => {
      const key = String(item.sessionDate ?? '')
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })
    return groups
  }, [scheduleItems])

  const todayItems = dayItemsByKey[todayKey] ?? []
  const todayClientSessions = todayItems.filter(
    (item) => !item.isCoachPrivateEvent && !item.isAthletePrivateEvent,
  )
  const weekItems = weekDayKeys.flatMap((key) => dayItemsByKey[key] ?? [])
  const weekClientSessions = weekItems.filter(
    (item) => !item.isCoachPrivateEvent && !item.isAthletePrivateEvent,
  )
  const nextCalendarSession = identifyNextCoachAppointment(sortedSessions, { now })
  const nextCalendarClient = nextCalendarSession
    ? getClientDisplayName(resolveClientForSession(nextCalendarSession) ?? {})
    : ''
  const weekOpenDays = weekDayKeys.filter(
    (key) => (dayItemsByKey[key] ?? []).length === 0,
  ).length

  return (
    <section className="coach-session-calendar-screen">
      <header className="coach-session-calendar-header">
        <div className="coach-session-calendar-title-row">
          <div>
            <span className="eyebrow">SCHEDULE</span>
            <h1>Calendar</h1>
          </div>

          <div className="coach-calendar-add-menu-wrap">
            <button
              type="button"
              className="gold-button machined coach-primary-action coach-calendar-add-trigger"
              data-testid="coach-calendar-add-trigger"
              aria-expanded={showAddMenu}
              aria-haspopup="menu"
              onClick={() => setShowAddMenu((current) => !current)}
            >
              <Plus {...ICON} />
              Add
              <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>

            {showAddMenu ? (
              <div
                className="coach-calendar-add-menu"
                role="menu"
                data-testid="coach-calendar-add-menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid="coach-add-personal-training"
                  onClick={openScheduleComposer}
                >
                  <span>
                    <strong>Personal training</strong>
                    <small>Client, date, time, and duration</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="coach-add-private-event-button"
                  onClick={openPrivateEventComposer}
                >
                  <span>
                    <strong>Private event</strong>
                    <small>Personal, admin, meeting, or unavailable time</small>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="coach-calendar-command-bar">
          <div
            className="coach-session-calendar-view-toggle"
            role="tablist"
            aria-label="Calendar view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === COACH_CALENDAR_VIEW.MONTH}
              className={viewMode === COACH_CALENDAR_VIEW.MONTH ? 'active' : ''}
              data-testid="coach-calendar-view-month"
              onClick={() => setViewMode(COACH_CALENDAR_VIEW.MONTH)}
            >
              Month
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
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === COACH_CALENDAR_VIEW.DAY}
              className={viewMode === COACH_CALENDAR_VIEW.DAY ? 'active' : ''}
              data-testid="coach-calendar-view-day"
              onClick={() => setViewMode(COACH_CALENDAR_VIEW.DAY)}
            >
              Day
            </button>
          </div>

          <div className="coach-calendar-period-control">
            <button
              type="button"
              aria-label={previousPeriodLabel}
              onClick={() => shiftCalendarPeriod(-1)}
            >
              <ChevronLeft {...ICON} />
            </button>
            <strong>{periodHeading}</strong>
            <button
              type="button"
              aria-label={nextPeriodLabel}
              onClick={() => shiftCalendarPeriod(1)}
            >
              <ChevronRight {...ICON} />
            </button>
          </div>

          <button
            type="button"
            className="coach-calendar-today-control"
            data-testid="coach-calendar-jump-today"
            onClick={goToTodayInCurrentView}
          >
            Today
          </button>
        </div>
      </header>

      <section className="coach-calendar-intelligence" aria-label="Calendar overview">
        <article className="coach-calendar-intelligence-primary">
          <span className="coach-calendar-intelligence-icon">
            <CalendarClock size={19} strokeWidth={1.7} />
          </span>
          <div>
            <small>TODAY</small>
            <strong>
              {todayClientSessions.length
                ? `${todayClientSessions.length} session${todayClientSessions.length === 1 ? '' : 's'}`
                : 'No client sessions'}
            </strong>
            <span>
              {todayItems.length > todayClientSessions.length
                ? `${todayItems.length - todayClientSessions.length} private calendar item${todayItems.length - todayClientSessions.length === 1 ? '' : 's'}`
                : 'Your day is clear outside coaching'}
            </span>
          </div>
        </article>

        <article>
          <small>NEXT</small>
          <strong>
            {nextCalendarSession
              ? `${formatTime12Hour(nextCalendarSession.startTime)} · ${nextCalendarClient || 'Client'}`
              : 'Nothing upcoming'}
          </strong>
          <span>
            {nextCalendarSession
              ? formatScheduleDateLong(nextCalendarSession.sessionDate)
              : 'Add a session when your schedule is ready'}
          </span>
        </article>

        <article>
          <small>THIS WEEK</small>
          <strong>{weekClientSessions.length} client session{weekClientSessions.length === 1 ? '' : 's'}</strong>
          <span>{weekOpenDays} open day{weekOpenDays === 1 ? '' : 's'} in this week</span>
        </article>
      </section>

      <div className="coach-calendar-legend" aria-label="Calendar legend">
        <span><i className="is-client" /> Client session</span>
        <span><i className="is-private" /> Private time</span>
        <span><i className="is-today" /> Today</span>
      </div>

      {viewMode === COACH_CALENDAR_VIEW.MONTH ? (
        <section className="coach-calendar-month-view" data-testid="coach-calendar-month-grid">
          <div className="coach-calendar-month-weekdays" aria-hidden="true">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="coach-calendar-month-grid">
            {monthDays.map(({ date, key, inCurrentMonth }) => {
              const items = dayItemsByKey[key] ?? []
              const isToday = key === todayKey
              const clientCount = items.filter(
                (item) => !item.isCoachPrivateEvent && !item.isAthletePrivateEvent,
              ).length
              const privateCount = items.length - clientCount
              return (
                <button
                  key={key}
                  type="button"
                  className={`coach-calendar-month-day${inCurrentMonth ? '' : ' is-outside'}${isToday ? ' is-today' : ''}${items.length ? ' has-items' : ''}`}
                  onClick={() => {
                    setSelectedDayKey(key)
                    setAnchor(date)
                    setViewMode(COACH_CALENDAR_VIEW.DAY)
                  }}
                  aria-label={`${formatCoachCalendarDayHeading(key)}, ${items.length} calendar item${items.length === 1 ? '' : 's'}`}
                >
                  <span className="coach-calendar-month-date">{date.getDate()}</span>
                  <div className="coach-calendar-month-events">
                    {items.slice(0, 3).map((item) => (
                      <span
                        key={item.id}
                        className={item.isCoachPrivateEvent || item.isAthletePrivateEvent ? 'is-private' : 'is-client'}
                      >
                        {item.startTime ? formatTime12Hour(item.startTime).replace(':00', '') : ''}
                        {' '}
                        {item.isCoachPrivateEvent
                          ? item.title
                          : getClientDisplayName(resolveClientForSession(item) ?? {})}
                      </span>
                    ))}
                    {items.length > 3 ? (
                      <em>+{items.length - 3} more</em>
                    ) : null}
                  </div>
                  {items.length > 0 ? (
                    <small>
                      {clientCount ? `${clientCount} client${clientCount === 1 ? '' : 's'}` : ''}
                      {clientCount && privateCount ? ' · ' : ''}
                      {privateCount ? `${privateCount} private` : ''}
                    </small>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {viewMode === COACH_CALENDAR_VIEW.WEEK ? (
        <section className="coach-calendar-week-board" data-testid="coach-calendar-week-grid">
          {weekDays.map((day) => {
            const key = dateKey(day)
            const items = dayItemsByKey[key] ?? []
            const isToday = key === todayKey
            return (
              <article key={key} className={`coach-calendar-week-column${isToday ? ' is-today' : ''}`}>
                <button
                  type="button"
                  className="coach-calendar-week-heading"
                  onClick={() => {
                    setSelectedDayKey(key)
                    setAnchor(day)
                    setViewMode(COACH_CALENDAR_VIEW.DAY)
                  }}
                >
                  <span>{day.toLocaleDateString([], { weekday: 'short' })}</span>
                  <strong>{day.getDate()}</strong>
                  <em>{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'Open'}</em>
                </button>
                <div className="coach-calendar-week-items">
                  {items.length ? items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`coach-calendar-week-item ${item.isCoachPrivateEvent || item.isAthletePrivateEvent ? 'is-private' : 'is-client'}`}
                      onClick={() => {
                        if (item.isCoachPrivateEvent) {
                          setSelectedDayKey(key)
                          setViewMode(COACH_CALENDAR_VIEW.DAY)
                        } else {
                          sessionDetail.openSession(item)
                        }
                      }}
                    >
                      <span>{formatTime12Hour(item.startTime)}</span>
                      <strong>
                        {item.isCoachPrivateEvent
                          ? item.title
                          : getClientDisplayName(resolveClientForSession(item) ?? {})}
                      </strong>
                    </button>
                  )) : (
                    <span className="coach-calendar-week-open">Open</span>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      ) : null}

      {loading ? (
        <p className="coach-session-calendar-loading">Loading sessions…</p>
      ) : viewMode === COACH_CALENDAR_VIEW.DAY ? (
        <section className="coach-session-calendar-day-block">
          <header className="coach-session-calendar-day-heading">
            <h2>{dayHeading}</h2>
          </header>

          {viewMode === COACH_CALENDAR_VIEW.DAY &&
          agendaDayKey === todayKey &&
          todayRsvpAlerts.length > 0 ? (
            <div className="coach-session-rsvp-alerts" role="status">
              {todayRsvpAlerts.map((alert) => (
                <p key={alert.id}>{alert.message}</p>
              ))}
            </div>
          ) : null}

          {renderAgendaList(agendaSessions, { dayKey: agendaDayKey })}

          {viewMode === COACH_CALENDAR_VIEW.DAY &&
          !agendaSessions.length &&
          emptyHint ? (
            <p className="coach-session-calendar-hint">{emptyHint}</p>
          ) : null}
        </section>
      ) : null}

      <CoachCalendarEventSheet
        open={showEventComposer}
        draft={eventDraft}
        submitting={eventSaving}
        onDraftChange={setEventDraft}
        onClose={() => {
          setShowEventComposer(false)
          setEditingPrivateEvent(null)
        }}
        onSubmit={handleSavePrivateEvent}
        title={editingPrivateEvent ? 'Edit private event' : 'Add to your schedule'}
        description={
          editingPrivateEvent?.isAthletePrivateEvent
            ? 'This is your private personal event. It stays private from your clients.'
            : 'Only you can see this event. It blocks the time from client scheduling.'
        }
        categoryOptions={
          editingPrivateEvent?.isAthletePrivateEvent
            ? Object.values(ATHLETE_CALENDAR_EVENT_CATEGORY)
            : Object.values(COACH_CALENDAR_EVENT_CATEGORY)
        }
        categoryLabels={
          editingPrivateEvent?.isAthletePrivateEvent
            ? ATHLETE_CALENDAR_EVENT_CATEGORY_LABEL
            : COACH_CALENDAR_EVENT_CATEGORY_LABEL
        }
        submitLabel={editingPrivateEvent ? 'Save changes' : 'Add to calendar'}
        onDelete={editingPrivateEvent ? handleDeletePrivateEvent : null}
      />

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
