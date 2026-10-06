import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Plus,
} from 'lucide-react'
import AthleteAppointmentDetailSheet from '../components/AthleteAppointmentDetailSheet'
import AthletePassStatus from '../components/AthletePassStatus'
import CoachCalendarEventSheet from '../components/CoachCalendarEventSheet'
import { useAthleteAppointments } from '../hooks/useAthleteAppointments'
import { appUi } from '../lib/appUi'
import {
  ATHLETE_CALENDAR_EVENT_CATEGORY,
  ATHLETE_CALENDAR_EVENT_CATEGORY_LABEL,
  athleteCalendarBackend,
  athleteCalendarEventCategoryLabel,
  createAthleteCalendarEventDraft,
  normalizeAthleteCalendarEvent,
} from '../lib/athleteCalendarEvents'
import { coachBackend } from '../lib/coachBackend'
import {
  buildCoachMonthDays,
  COACH_CALENDAR_VIEW,
  formatCoachCalendarDayHeading,
  formatCoachCalendarMonthHeading,
  formatCoachCalendarWeekHeading,
} from '../lib/coachCalendarUi'
import {
  findOverlappingAppointment,
} from '../lib/coachingAppointment'
import {
  normalizeAthleteScheduledSession,
  normalizeScheduledSession,
  sortScheduledSessions,
} from '../lib/coachScheduledSessions'
import {
  createCoachCalendarEventDraft,
  normalizeCoachCalendarEvent,
} from '../lib/coachCalendarEvents'
import {
  addDaysKey,
  dateKey as scheduleDateKey,
  formatTime12Hour,
  isScheduleTimeInPast,
} from '../lib/appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from '../lib/sessionTimezone'
import { getClientDisplayName } from '../lib/clientDisplayName'
import {
  resolveAthleteDataId,
  resolveRecordBusinessClientId,
} from '../lib/coachBusinessClient'

const ICON = { size: 18, strokeWidth: 1.75 }
const DAY_MS = 86400000

const dateKey = (date) => scheduleDateKey(date, DEFAULT_COACH_SCHEDULE_TIMEZONE)
const addDays = (date, days) =>
  new Date(new Date(date).getTime() + days * DAY_MS)

const mondayOf = (input) => {
  const date = new Date(input)
  date.setHours(12, 0, 0, 0)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date
}

const sourceLabel = (item = {}) => {
  if (item.isAthletePrivateEvent) return 'Private'
  if (item.isCoachPrivateEvent) return 'Your coach calendar'
  if (item.isCoachWorkAppointment) return 'Coaching'
  return 'Coach appointment'
}

const itemTitle = (item = {}) => {
  if (item.isAthletePrivateEvent || item.isCoachPrivateEvent) {
    return item.title || 'Private event'
  }
  if (item.isCoachWorkAppointment) {
    return item.coachClientLabel || 'Client session'
  }
  return item.coachDisplayName
    ? `Training with ${item.coachDisplayName}`
    : 'Personal training'
}

export default function AthleteInPersonScheduleScreen({
  onBack,
  embedded = false,
  includeCoachCalendar = false,
}) {
  const {
    upcomingAppointments,
    loading,
    ready,
    refreshAppointments,
  } = useAthleteAppointments()

  const [viewMode, setViewMode] = useState(COACH_CALENDAR_VIEW.MONTH)
  const [anchor, setAnchor] = useState(new Date())
  const [selectedDayKey, setSelectedDayKey] = useState(() => dateKey(new Date()))
  const [detailAppointment, setDetailAppointment] = useState(null)
  const [pastAppointments, setPastAppointments] = useState([])
  const [athleteEvents, setAthleteEvents] = useState([])
  const [coachPrivateEvents, setCoachPrivateEvents] = useState([])
  const [coachWorkAppointments, setCoachWorkAppointments] = useState([])
  const [coachRoster, setCoachRoster] = useState([])
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [showEventComposer, setShowEventComposer] = useState(false)
  const [eventSaving, setEventSaving] = useState(false)
  const [editingPrivateEvent, setEditingPrivateEvent] = useState(null)
  const [eventDraft, setEventDraft] = useState(() =>
    createAthleteCalendarEventDraft(dateKey(new Date())),
  )

  const todayKey = dateKey(new Date())
  const weekStart = useMemo(() => mondayOf(anchor), [anchor])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )
  const monthDays = useMemo(() => buildCoachMonthDays(anchor), [anchor])

  useEffect(() => {
    refreshAppointments({ force: true })
  }, [refreshAppointments])

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true)
    const startDate = dateKey(addDays(anchor, -42))
    const endDate = addDaysKey(startDate, 168)

    try {
      const requests = [
        athleteCalendarBackend.list({ startDate, endDate }),
        coachBackend.listAthleteScheduledSessionHistory(),
      ]

      if (includeCoachCalendar) {
        requests.push(
          coachBackend.listCoachCalendarEvents({ startDate, endDate }),
          coachBackend.listScheduledSessions({ startDate, endDate }),
          coachBackend.listCoachRoster({ includeArchived: false }),
        )
      }

      const [
        athleteEventRows,
        historyRows,
        coachPrivateRows = [],
        coachSessionRows = [],
        rosterRows = [],
      ] = await Promise.all(requests)

      setAthleteEvents(
        (athleteEventRows ?? []).map(normalizeAthleteCalendarEvent).filter(Boolean),
      )
      setPastAppointments(
        (historyRows ?? []).map(normalizeAthleteScheduledSession).filter(Boolean),
      )

      if (includeCoachCalendar) {
        setCoachPrivateEvents(
          (coachPrivateRows ?? []).map(normalizeCoachCalendarEvent).filter(Boolean),
        )
        setCoachWorkAppointments(
          (coachSessionRows ?? []).map(normalizeScheduledSession).filter(Boolean),
        )
        setCoachRoster(rosterRows ?? [])
      } else {
        setCoachPrivateEvents([])
        setCoachWorkAppointments([])
        setCoachRoster([])
      }
    } catch (error) {
      appUi.toast(error.message ?? 'Could not load your calendar.', 'error')
    } finally {
      setCalendarLoading(false)
    }
  }, [anchor, includeCoachCalendar])

  useEffect(() => {
    void loadCalendar()
  }, [loadCalendar])

  useEffect(() => {
    const refresh = () => void loadCalendar()
    window.addEventListener('focus', refresh)
    window.addEventListener('avaren:coach-calendar-updated', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('avaren:coach-calendar-updated', refresh)
    }
  }, [loadCalendar])

  const clientByAthleteId = useMemo(
    () =>
      Object.fromEntries(
        coachRoster
          .map((client) => [resolveAthleteDataId(client), client])
          .filter(([id]) => Boolean(id)),
      ),
    [coachRoster],
  )

  const clientByBusinessId = useMemo(
    () =>
      Object.fromEntries(
        coachRoster
          .map((client) => [resolveRecordBusinessClientId(client), client])
          .filter(([id]) => Boolean(id)),
      ),
    [coachRoster],
  )

  const coachWorkWithLabels = useMemo(
    () =>
      coachWorkAppointments.map((session) => {
        const client =
          clientByBusinessId[session.businessClientId] ??
          clientByAthleteId[session.athleteId] ??
          null
        return {
          ...session,
          isCoachWorkAppointment: true,
          coachClientLabel: client ? getClientDisplayName(client) : 'Client session',
        }
      }),
    [coachWorkAppointments, clientByBusinessId, clientByAthleteId],
  )

  const athleteAppointments = useMemo(() => {
    const byId = new Map()
    ;[...(pastAppointments ?? []), ...(upcomingAppointments ?? [])].forEach(
      (appointment) => {
        if (appointment?.id) byId.set(appointment.id, appointment)
      },
    )
    return [...byId.values()]
  }, [pastAppointments, upcomingAppointments])

  const scheduleItems = useMemo(
    () =>
      sortScheduledSessions([
        ...athleteAppointments,
        ...athleteEvents,
        ...coachPrivateEvents,
        ...coachWorkWithLabels,
      ]),
    [
      athleteAppointments,
      athleteEvents,
      coachPrivateEvents,
      coachWorkWithLabels,
    ],
  )

  const dayItemsByKey = useMemo(() => {
    const groups = {}
    scheduleItems.forEach((item) => {
      const key = String(item.sessionDate ?? '')
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })
    return groups
  }, [scheduleItems])

  const selectedDayItems = dayItemsByKey[selectedDayKey] ?? []
  const weekDayKeys = weekDays.map((day) => dateKey(day))
  const todayItems = dayItemsByKey[todayKey] ?? []
  const weekItems = weekDayKeys.flatMap((key) => dayItemsByKey[key] ?? [])
  const nextCoachAppointment = upcomingAppointments?.[0] ?? null
  const athletePrivateThisWeek = weekItems.filter(
    (item) => item.isAthletePrivateEvent,
  ).length
  const openDaysThisWeek = weekDayKeys.filter(
    (key) => (dayItemsByKey[key] ?? []).length === 0,
  ).length

  const shiftMonth = (delta) => {
    const next = new Date(anchor)
    next.setHours(12, 0, 0, 0)
    next.setDate(1)
    next.setMonth(next.getMonth() + delta)
    setAnchor(next)
  }

  const shiftDay = (delta) => {
    const nextKey = addDaysKey(selectedDayKey, delta)
    setSelectedDayKey(nextKey)
    setAnchor(new Date(`${nextKey}T12:00:00`))
  }

  const shiftPeriod = (delta) => {
    if (viewMode === COACH_CALENDAR_VIEW.MONTH) {
      shiftMonth(delta)
      return
    }
    if (viewMode === COACH_CALENDAR_VIEW.WEEK) {
      setAnchor(addDays(anchor, delta * 7))
      return
    }
    shiftDay(delta)
  }

  const monthHeading = formatCoachCalendarMonthHeading(anchor)
  const weekHeading = formatCoachCalendarWeekHeading(dateKey(weekDays[0]))
  const dayHeading = formatCoachCalendarDayHeading(selectedDayKey)
  const periodHeading =
    viewMode === COACH_CALENDAR_VIEW.MONTH
      ? monthHeading
      : viewMode === COACH_CALENDAR_VIEW.WEEK
        ? weekHeading
        : dayHeading

  const goToday = () => {
    const current = new Date()
    setAnchor(current)
    setSelectedDayKey(dateKey(current))
  }

  const openAddEvent = () => {
    setEditingPrivateEvent(null)
    setEventDraft(createAthleteCalendarEventDraft(selectedDayKey))
    setShowEventComposer(true)
  }

  const openPrivateEventEditor = (item) => {
    setEditingPrivateEvent(item)
    setEventDraft({
      title: item.title ?? '',
      eventDate: item.eventDate ?? item.sessionDate ?? selectedDayKey,
      startTime: String(item.startTime ?? '').slice(0, 5),
      durationMinutes: String(item.durationMinutes ?? 60),
      category:
        item.category ??
        (item.isAthletePrivateEvent
          ? ATHLETE_CALENDAR_EVENT_CATEGORY.PERSONAL
          : 'personal'),
      locationName: item.locationName ?? '',
      notes: item.notes ?? '',
    })
    setShowEventComposer(true)
  }

  const handleSaveEvent = async () => {
    const title = eventDraft.title.trim()
    if (!title) return

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

    const candidate = {
      sessionDate: eventDraft.eventDate,
      startTime: eventDraft.startTime,
      durationMinutes: Number(eventDraft.durationMinutes) || 60,
      status: 'scheduled',
    }

    if (
      findOverlappingAppointment(candidate, scheduleItems, {
        excludeId: editingPrivateEvent?.id ?? null,
      })
    ) {
      const confirmed = await appUi.confirm({
        message: 'That time overlaps something already on your calendar. Add it anyway?',
        confirmLabel: 'Add anyway',
      })
      if (!confirmed) return
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
      } else if (editingPrivateEvent?.isCoachPrivateEvent && includeCoachCalendar) {
        await coachBackend.updateCoachCalendarEvent(
          editingPrivateEvent.id,
          {
            ...payload,
            existingItems: scheduleItems,
          },
        )
      } else {
        await athleteCalendarBackend.create(payload)
      }

      setShowEventComposer(false)
      setEditingPrivateEvent(null)
      setSelectedDayKey(eventDraft.eventDate)
      setAnchor(new Date(`${eventDraft.eventDate}T12:00:00`))
      appUi.toast(
        editingPrivateEvent ? 'Calendar event updated.' : 'Added to your private calendar.',
        'success',
      )
      await loadCalendar()
    } catch (error) {
      appUi.toast(error.message ?? 'Could not add calendar event.', 'error')
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
      } else if (editingPrivateEvent.isCoachPrivateEvent && includeCoachCalendar) {
        await coachBackend.deleteCoachCalendarEvent(editingPrivateEvent.id)
      }
      setShowEventComposer(false)
      setEditingPrivateEvent(null)
      appUi.toast('Calendar event deleted.', 'success')
      await loadCalendar()
    } catch (error) {
      appUi.toast(error.message ?? 'Could not delete event.', 'error')
    } finally {
      setEventSaving(false)
    }
  }

  const renderDayItem = (item) => {
    const privateItem = item.isAthletePrivateEvent || item.isCoachPrivateEvent
    const coachWork = item.isCoachWorkAppointment

    if (privateItem) {
      return (
        <button
          key={`${sourceLabel(item)}:${item.id}`}
          type="button"
          className="athlete-calendar-agenda-item athlete-calendar-agenda-item--private"
          onClick={() => openPrivateEventEditor(item)}
        >
          <div>
            <span className="eyebrow">{sourceLabel(item).toUpperCase()}</span>
            <strong>{formatTime12Hour(item.startTime)} · {itemTitle(item)}</strong>
            <small>
              {item.isAthletePrivateEvent
                ? athleteCalendarEventCategoryLabel(item)
                : 'Private coach event'}
              {item.locationName ? ` · ${item.locationName}` : ''}
            </small>
          </div>
          <LockKeyhole size={16} strokeWidth={1.7} aria-hidden="true" />
        </button>
      )
    }

    if (coachWork) {
      return (
        <div
          key={`coach-work:${item.id}`}
          className="athlete-calendar-agenda-item athlete-calendar-agenda-item--coach-work"
        >
          <div>
            <span className="eyebrow">COACHING</span>
            <strong>{formatTime12Hour(item.startTime)} · {itemTitle(item)}</strong>
            <small>Coach Hub appointment · read-only here</small>
          </div>
          <LockKeyhole size={16} strokeWidth={1.7} aria-hidden="true" />
        </div>
      )
    }

    return (
      <button
        key={`athlete-appointment:${item.id}`}
        type="button"
        className="athlete-calendar-agenda-item athlete-calendar-agenda-item--appointment"
        onClick={() => setDetailAppointment(item)}
      >
        <div>
          <span className="eyebrow">COACH APPOINTMENT</span>
          <strong>{formatTime12Hour(item.startTime)} · {itemTitle(item)}</strong>
          <small>Managed by your coach · you can’t delete this appointment</small>
        </div>
        <LockKeyhole size={16} strokeWidth={1.7} aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="athlete-in-person-schedule-screen athlete-calendar-screen">
      <header className="coach-session-calendar-header athlete-calendar-header">
        {!embedded ? (
          <button type="button" className="ui-btn-tertiary athlete-schedule-back" onClick={onBack}>
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            Back
          </button>
        ) : null}

        <div className="coach-session-calendar-title-row">
          <div>
            <span className="eyebrow">YOUR SCHEDULE</span>
            <h1>Calendar</h1>
            {includeCoachCalendar ? (
              <p className="athlete-calendar-merged-note">
                Athlete + Coach calendars are merged for this account.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className="gold-button machined coach-primary-action coach-calendar-add-trigger"
            onClick={openAddEvent}
          >
            <Plus {...ICON} />
            Add event
          </button>
        </div>

        <div className="coach-calendar-command-bar">
          <div
            className="coach-session-calendar-view-toggle"
            role="tablist"
            aria-label="Calendar view"
          >
            {[COACH_CALENDAR_VIEW.MONTH, COACH_CALENDAR_VIEW.WEEK, COACH_CALENDAR_VIEW.DAY].map(
              (view) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === view}
                  className={viewMode === view ? 'active' : ''}
                  onClick={() => setViewMode(view)}
                >
                  {view[0].toUpperCase() + view.slice(1)}
                </button>
              ),
            )}
          </div>

          <div className="coach-calendar-period-control">
            <button
              type="button"
              aria-label="Previous period"
              onClick={() => shiftPeriod(-1)}
            >
              <ChevronLeft {...ICON} />
            </button>
            <strong>{periodHeading}</strong>
            <button
              type="button"
              aria-label="Next period"
              onClick={() => shiftPeriod(1)}
            >
              <ChevronRight {...ICON} />
            </button>
          </div>

          <button
            type="button"
            className="coach-calendar-today-control"
            onClick={goToday}
          >
            Today
          </button>
        </div>
      </header>

      <section className="athlete-calendar-intelligence" aria-label="Your calendar overview">
        <article className="athlete-calendar-intelligence-primary">
          <span className="athlete-calendar-intelligence-icon">
            <CalendarClock size={19} strokeWidth={1.7} />
          </span>
          <div>
            <small>TODAY</small>
            <strong>
              {todayItems.length
                ? `${todayItems.length} calendar item${todayItems.length === 1 ? '' : 's'}`
                : 'Your day is open'}
            </strong>
            <span>
              {todayItems.length
                ? 'Tap Day to see the full agenda'
                : 'No AVAREN commitments scheduled today'}
            </span>
          </div>
        </article>

        <article>
          <small>NEXT COACHING</small>
          <strong>
            {nextCoachAppointment
              ? `${formatTime12Hour(nextCoachAppointment.startTime)} · ${itemTitle(nextCoachAppointment)}`
              : 'Nothing scheduled'}
          </strong>
          <span>
            {nextCoachAppointment
              ? formatCoachCalendarDayHeading(nextCoachAppointment.sessionDate)
              : 'Your next coaching session will appear here'}
          </span>
        </article>

        <article>
          <small>THIS WEEK</small>
          <strong>{openDaysThisWeek} open day{openDaysThisWeek === 1 ? '' : 's'}</strong>
          <span>
            {athletePrivateThisWeek
              ? `${athletePrivateThisWeek} private event${athletePrivateThisWeek === 1 ? '' : 's'} on your calendar`
              : 'No private events this week'}
          </span>
        </article>
      </section>

      <div className="coach-calendar-legend athlete-calendar-legend" aria-label="Calendar legend">
        <span><i className="is-client" /> Coaching</span>
        <span><i className="is-private" /> Private</span>
        <span><i className="is-today" /> Today</span>
      </div>

      {calendarLoading || (!ready && loading) ? (
        <p className="athlete-in-person-schedule-empty">Loading calendar…</p>
      ) : null}

      {viewMode === COACH_CALENDAR_VIEW.MONTH ? (
        <section className="coach-calendar-month-view athlete-calendar-month" data-testid="athlete-calendar-month">
          <div className="coach-calendar-month-weekdays" aria-hidden="true">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="coach-calendar-month-grid">
            {monthDays.map(({ date, key, inCurrentMonth }) => {
              const items = dayItemsByKey[key] ?? []
              return (
                <button
                  key={key}
                  type="button"
                  className={`coach-calendar-month-day${inCurrentMonth ? '' : ' is-outside'}${key === todayKey ? ' is-today' : ''}${items.length ? ' has-items' : ''}`}
                  onClick={() => {
                    setSelectedDayKey(key)
                    setAnchor(date)
                    setViewMode(COACH_CALENDAR_VIEW.DAY)
                  }}
                >
                  <span className="coach-calendar-month-date">{date.getDate()}</span>
                  <div className="coach-calendar-month-events">
                    {items.slice(0, 3).map((item) => (
                      <span
                        key={`${sourceLabel(item)}:${item.id}`}
                        className={
                          item.isAthletePrivateEvent || item.isCoachPrivateEvent
                            ? 'is-private'
                            : 'is-client'
                        }
                      >
                        {formatTime12Hour(item.startTime).replace(':00', '')}{' '}
                        {itemTitle(item)}
                      </span>
                    ))}
                    {items.length > 3 ? <em>+{items.length - 3} more</em> : null}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {viewMode === COACH_CALENDAR_VIEW.WEEK ? (
        <section className="coach-calendar-week-board athlete-calendar-week" data-testid="athlete-calendar-week">
          {weekDays.map((day) => {
            const key = dateKey(day)
            const items = dayItemsByKey[key] ?? []
            return (
              <article key={key} className={`coach-calendar-week-column${key === todayKey ? ' is-today' : ''}`}>
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
                  {items.length ? (
                    items.map((item) => (
                      <button
                        key={`${sourceLabel(item)}:${item.id}`}
                        type="button"
                        className={`coach-calendar-week-item ${item.isAthletePrivateEvent || item.isCoachPrivateEvent ? 'is-private' : 'is-client'}`}
                        onClick={() => {
                          setSelectedDayKey(key)
                          setAnchor(day)
                          setViewMode(COACH_CALENDAR_VIEW.DAY)
                        }}
                      >
                        <span>{formatTime12Hour(item.startTime)}</span>
                        <strong>{itemTitle(item)}</strong>
                      </button>
                    ))
                  ) : (
                    <span className="coach-calendar-week-open">Open</span>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      ) : null}

      {viewMode === COACH_CALENDAR_VIEW.DAY ? (
        <section className="athlete-calendar-day">
          <div className="athlete-calendar-day-heading">
            <div>
              <span className="eyebrow">DAY</span>
              <h2>{dayHeading}</h2>
            </div>
            <small>{selectedDayItems.length ? `${selectedDayItems.length} item${selectedDayItems.length === 1 ? '' : 's'}` : 'Open'}</small>
          </div>

          {selectedDayItems.length ? (
            <div className="athlete-calendar-agenda">
              {selectedDayItems.map(renderDayItem)}
            </div>
          ) : (
            <div className="athlete-in-person-schedule-empty">
              <CalendarDays size={28} strokeWidth={1.5} />
              <p>Nothing scheduled.</p>
              <span>This time is open on your AVAREN calendar.</span>
            </div>
          )}
        </section>
      ) : null}

      <AthletePassStatus variant="detailed" />

      <CoachCalendarEventSheet
        open={showEventComposer}
        draft={eventDraft}
        submitting={eventSaving}
        onDraftChange={setEventDraft}
        onClose={() => {
          setShowEventComposer(false)
          setEditingPrivateEvent(null)
        }}
        onSubmit={handleSaveEvent}
        title={editingPrivateEvent ? 'Edit private event' : 'Add private event'}
        description={
          editingPrivateEvent?.isCoachPrivateEvent
            ? 'This is your coach-side private event. Only you can see it.'
            : 'Only you can see this event. Your coach cannot see your private calendar.'
        }
        categoryOptions={
          editingPrivateEvent?.isCoachPrivateEvent
            ? ['personal', 'admin', 'meeting', 'unavailable', 'other']
            : Object.values(ATHLETE_CALENDAR_EVENT_CATEGORY)
        }
        categoryLabels={
          editingPrivateEvent?.isCoachPrivateEvent
            ? {
                personal: 'Personal',
                admin: 'Admin',
                meeting: 'Meeting',
                unavailable: 'Unavailable',
                other: 'Other',
              }
            : ATHLETE_CALENDAR_EVENT_CATEGORY_LABEL
        }
        testId="athlete-calendar-event-sheet"
        submitLabel={editingPrivateEvent ? 'Save changes' : 'Add to calendar'}
        onDelete={editingPrivateEvent ? handleDeletePrivateEvent : null}
      />

      <AthleteAppointmentDetailSheet
        appointment={detailAppointment}
        open={Boolean(detailAppointment)}
        onClose={() => setDetailAppointment(null)}
        onUpdated={(updated) => {
          refreshAppointments({ force: true })
          setDetailAppointment(updated)
        }}
      />
    </div>
  )
}
