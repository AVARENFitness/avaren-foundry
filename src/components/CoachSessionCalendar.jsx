import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  UserRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import {
  cancelScheduledSession,
  completeScheduledSession,
  normalizeScheduledSession,
  SCHEDULED_SESSION_STATUS,
  sortScheduledSessions,
} from '../lib/coachScheduledSessions'
import { formatScheduledSessionTime } from '../lib/sessionTimezone'
import {
  emptySessionPackage,
  normalizeSessionHistoryEntry,
  normalizeSessionPackage,
} from '../lib/sessionPackages'
import EmptyState from './ui/EmptyState'
import CoachScheduleSessionSheet from './CoachScheduleSessionSheet'
import { getClientDisplayName } from '../lib/clientDisplayName'
import {
  buildCoachRsvpAlert,
  isRsvpException,
  rsvpCoachLabel,
  sortSessionsForCoachToday,
} from '../lib/sessionRsvp'

const ICON = { size: 18, strokeWidth: 1.75 }
const DAY_MS = 86400000

const dateKey = (date) => new Date(date).toISOString().slice(0, 10)
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
  coachEmail = 'Coach',
  onOpenClientProfile,
  initialClientId = '',
}) {
  const [anchor, setAnchor] = useState(new Date())
  const [sessions, setSessions] = useState([])
  const [packages, setPackages] = useState({})
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [activeSession, setActiveSession] = useState(null)
  const [rescheduleMode, setRescheduleMode] = useState(false)
  const [rescheduleDraft, setRescheduleDraft] = useState({
    sessionDate: '',
    startTime: '',
  })
  const [undoState, setUndoState] = useState(null)
  const [completingSessionId, setCompletingSessionId] = useState(null)
  const [undoingSessionId, setUndoingSessionId] = useState(null)
  const [scheduling, setScheduling] = useState(false)
  const [draft, setDraft] = useState({
    athleteId: initialClientId,
    sessionDate: dateKey(new Date()),
    startTime: '09:00',
    durationMinutes: '60',
    coachNote: '',
  })

  const weekStart = useMemo(() => mondayOf(anchor), [anchor])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )
  const todayKey = dateKey(new Date())

  const loadPackages = useCallback(async () => {
    const entries = await Promise.all(
      clients.map(async (client) => {
        try {
          const row = await coachBackend.getSessionPackage(client.athlete_id)
          return [client.athlete_id, normalizeSessionPackage(row)]
        } catch {
          return [client.athlete_id, emptySessionPackage()]
        }
      }),
    )
    setPackages(Object.fromEntries(entries))
  }, [clients])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await coachBackend.listScheduledSessions({
        startDate: dateKey(weekDays[0]),
        endDate: dateKey(weekDays[6]),
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
    loadPackages()
  }, [loadPackages])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

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

  const todaySessions = useMemo(
    () =>
      sortSessionsForCoachToday(
        sortedSessions.filter(
          (session) => session.sessionDate === todayKey,
        ),
      ),
    [sortedSessions, todayKey],
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

  const upcomingSessions = useMemo(
    () =>
      sortedSessions.filter(
        (session) => session.sessionDate !== todayKey,
      ),
    [sortedSessions, todayKey],
  )

  const packageFor = (athleteId) =>
    packages[athleteId] ?? emptySessionPackage()

  const showCompletionError = (error) => {
    if (error === 'already_completed') {
      appUi.toast('This session is already complete.', 'info')
      return
    }
    if (error === 'no_sessions_remaining') {
      appUi.toast('No sessions remaining on this package.', 'error')
      return
    }
    if (error === 'no_package') {
      appUi.toast('Add a session package before completing.', 'error')
      return
    }
    if (error === 'package_expired') {
      appUi.toast('This session package has expired.', 'error')
      return
    }
    appUi.toast('Could not complete this session.', 'error')
  }

  const handleSchedule = async () => {
    if (!draft.athleteId) {
      appUi.toast('Select a client.', 'error')
      return
    }

    setScheduling(true)

    try {
      const created = await coachBackend.createScheduledSession({
        athleteId: draft.athleteId,
        sessionDate: draft.sessionDate,
        startTime: draft.startTime,
        durationMinutes: draft.durationMinutes
          ? Number(draft.durationMinutes)
          : null,
        coachNote: draft.coachNote.trim(),
      })
      setShowComposer(false)
      setDraft((current) => ({ ...current, coachNote: '' }))
      appUi.toast('Session scheduled.', 'success')
      const normalized = normalizeScheduledSession(created)
      if (normalized) {
        setSessions((current) => sortScheduledSessions([...current, normalized]))
      }
      await loadSessions()
    } catch (error) {
      appUi.toast(error.message ?? 'Could not schedule session.', 'error')
    } finally {
      setScheduling(false)
    }
  }

  const handleComplete = async (session) => {
    if (
      completingSessionId === session.id ||
      session.status !== SCHEDULED_SESSION_STATUS.SCHEDULED
    ) {
      return
    }

    const pkg = packageFor(session.athleteId)
    const precheck = completeScheduledSession({
      session,
      pkg,
      coachLabel: coachEmail,
    })

    if (!precheck.ok) {
      showCompletionError(precheck.error)
      return
    }

    setCompletingSessionId(session.id)

    try {
      const result = await coachBackend.completeScheduledSessionAtomic(
        session.id,
        coachEmail,
      )

      if (!result.ok) {
        showCompletionError(result.error)
        if (result.error === 'already_completed') {
          await loadSessions()
          await loadPackages()
        }
        return
      }

      const savedSession = normalizeScheduledSession(result.session)
      const savedPackage = normalizeSessionPackage(result.package)
      const savedHistory = normalizeSessionHistoryEntry(result.history)

      setPackages((current) => ({
        ...current,
        [session.athleteId]: savedPackage,
      }))
      setSessions((current) =>
        current.map((item) =>
          item.id === session.id ? savedSession : item,
        ),
      )
      setActiveSession(savedSession)
      setUndoState({
        session: savedSession,
        undoSnapshot: {
          sessionsRemaining: pkg.sessionsRemaining,
          sessionsUsed: pkg.sessionsUsed,
          historyEntryId: savedHistory?.id ?? null,
        },
        packageBefore: pkg,
      })

      appUi.toast('Session completed.', 'success', {
        actionLabel: 'Undo',
        durationMs: 10000,
        onAction: () =>
          handleUndoCompletion(savedSession, {
            sessionsRemaining: pkg.sessionsRemaining,
            sessionsUsed: pkg.sessionsUsed,
            historyEntryId: savedHistory?.id ?? null,
          }),
      })
    } catch (error) {
      appUi.toast(error.message ?? 'Could not complete session.', 'error')
    } finally {
      setCompletingSessionId(null)
    }
  }

  const handleUndoCompletion = async (session, snapshot) => {
    if (
      undoingSessionId === session.id ||
      session.status !== SCHEDULED_SESSION_STATUS.COMPLETED
    ) {
      return
    }

    setUndoingSessionId(session.id)

    try {
      const result =
        await coachBackend.undoScheduledSessionCompletionAtomic(session.id)

      if (!result.ok) {
        appUi.toast('Undo is no longer available.', 'error')
        return
      }

      const restored = normalizeScheduledSession(result.session)
      const restoredPackage = normalizeSessionPackage(result.package)

      setPackages((current) => ({
        ...current,
        [session.athleteId]: restoredPackage,
      }))
      setSessions((current) =>
        current.map((item) => (item.id === session.id ? restored : item)),
      )
      setActiveSession(restored)
      setUndoState(null)
      appUi.toast('Session completion undone.', 'success')
    } catch (error) {
      appUi.toast(error.message ?? 'Could not undo completion.', 'error')
    } finally {
      setUndoingSessionId(null)
    }
  }

  const handleCancel = async (session) => {
    const result = cancelScheduledSession(session)
    if (!result.ok) return

    try {
      const saved = normalizeScheduledSession(
        await coachBackend.updateScheduledSession(session.id, {
          status: SCHEDULED_SESSION_STATUS.CANCELLED,
        }),
      )
      setSessions((current) =>
        current.map((item) => (item.id === session.id ? saved : item)),
      )
      setActiveSession(null)
      appUi.toast('Session cancelled.', 'success')
    } catch (error) {
      appUi.toast(error.message ?? 'Could not cancel session.', 'error')
    }
  }

  const handleReschedule = async (session, patch) => {
    try {
      const saved = normalizeScheduledSession(
        await coachBackend.updateScheduledSession(session.id, {
          ...patch,
          scheduleTimezone: session.scheduleTimezone,
        }),
      )
      setSessions((current) =>
        current.map((item) => (item.id === session.id ? saved : item)),
      )
      setActiveSession(saved)
      appUi.toast('Session rescheduled.', 'success')
      await loadSessions()
    } catch (error) {
      appUi.toast(error.message ?? 'Could not reschedule session.', 'error')
    }
  }

  const renderSessionRow = (session) => {
    const client = clientByAthleteId[session.athleteId]
    const pkg = packageFor(session.athleteId)
    const remainingLabel =
      pkg.totalSessions > 0
        ? `${pkg.sessionsRemaining} remaining`
        : 'No package'

    return (
      <button
        type="button"
        key={session.id}
        className={`coach-session-calendar-row status-${session.status} rsvp-${session.rsvpStatus}${isRsvpException(session) ? ' is-rsvp-exception' : ''}`}
        onClick={() => setActiveSession(session)}
      >
        <div>
          <strong>{getClientDisplayName(client ?? {})}</strong>
          <span>
            {formatScheduledSessionTime(session)}
            {session.durationMinutes
              ? ` · ${session.durationMinutes} min`
              : ''}
          </span>
          {session.status === SCHEDULED_SESSION_STATUS.SCHEDULED && (
            <small className="coach-session-rsvp-label">
              {rsvpCoachLabel(session.rsvpStatus)}
            </small>
          )}
        </div>
        <div className="coach-session-calendar-row-meta">
          <small>{session.status}</small>
          <small>{remainingLabel}</small>
        </div>
      </button>
    )
  }

  const activeClient = activeSession
    ? clientByAthleteId[activeSession.athleteId]
    : null
  const activePackage = activeSession
    ? packageFor(activeSession.athleteId)
    : emptySessionPackage()

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
          onClick={() => setShowComposer(true)}
        >
          <Plus {...ICON} />
          Schedule Session
        </button>
      </header>

      <div className="coach-session-calendar-toolbar">
        <button type="button" onClick={() => setAnchor(addDays(anchor, -7))}>
          <ChevronLeft {...ICON} />
        </button>
        <strong>
          {weekDays[0].toLocaleDateString([], { month: 'short', day: 'numeric' })}
          {' – '}
          {weekDays[6].toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </strong>
        <button type="button" onClick={() => setAnchor(addDays(anchor, 7))}>
          <ChevronRight {...ICON} />
        </button>
      </div>

      {loading ? (
        <p>Loading sessions…</p>
      ) : (
        <>
          <section className="coach-session-calendar-day-block">
            <header>
              <span className="eyebrow">TODAY</span>
              <h3>
                {new Date().toLocaleDateString([], {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </h3>
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
                {todaySessions.map(renderSessionRow)}
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Nothing scheduled today"
                description="Schedule an in-person session when you're ready."
              />
            )}
          </section>

          {upcomingSessions.length > 0 && (
            <section className="coach-session-calendar-day-block">
              <header>
                <span className="eyebrow">THIS WEEK</span>
                <h3>Upcoming sessions</h3>
              </header>
              <div className="coach-session-calendar-list">
                {upcomingSessions.map(renderSessionRow)}
              </div>
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
      />

      {activeSession && (
        <div className="coach-designer-backdrop" onClick={() => { setActiveSession(null); setRescheduleMode(false) }}>
          <section
            className="coach-session-detail-sheet"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">SESSION</span>
                <h2>{getClientDisplayName(activeClient ?? {})}</h2>
              </div>
              <button type="button" onClick={() => { setActiveSession(null); setRescheduleMode(false) }} aria-label="Close">
                <X {...ICON} />
              </button>
            </header>
            {!rescheduleMode ? (
              <p>
                {activeSession.sessionDate} · {formatScheduledSessionTime(activeSession)}
                {activeSession.durationMinutes
                  ? ` · ${activeSession.durationMinutes} min`
                  : ''}
              </p>
            ) : (
              <div className="coach-session-reschedule-fields">
                <label className="coach-date-field">
                  <span>Date</span>
                  <input
                    type="date"
                    className="coach-field-input"
                    value={rescheduleDraft.sessionDate}
                    onChange={(event) =>
                      setRescheduleDraft((current) => ({
                        ...current,
                        sessionDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="coach-date-field">
                  <span>Start time</span>
                  <input
                    type="time"
                    className="coach-field-input"
                    value={rescheduleDraft.startTime}
                    onChange={(event) =>
                      setRescheduleDraft((current) => ({
                        ...current,
                        startTime: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            )}
            <div className="coach-session-detail-balance">
              <Clock3 {...ICON} />
              <div>
                <strong>
                  {activePackage.totalSessions > 0
                    ? `${activePackage.sessionsRemaining} sessions remaining`
                    : 'No package on file'}
                </strong>
                <span>
                  {activePackage.totalSessions > 0
                    ? `${activePackage.sessionsUsed} of ${activePackage.totalSessions} used`
                    : 'Add sessions from the client profile before completing.'}
                </span>
              </div>
            </div>
            {activeSession.coachNote && (
              <p className="coach-session-detail-note">{activeSession.coachNote}</p>
            )}
            {activeSession.status === SCHEDULED_SESSION_STATUS.SCHEDULED && (
              <p className={`coach-session-detail-rsvp rsvp-${activeSession.rsvpStatus}`}>
                RSVP: {rsvpCoachLabel(activeSession.rsvpStatus)}
              </p>
            )}
            <div className="coach-session-detail-actions">
              <button
                type="button"
                className="coach-secondary-button"
                onClick={() => {
                  onOpenClientProfile?.(activeClient)
                  setActiveSession(null)
                }}
              >
                <UserRound {...ICON} />
                Open Client Profile
              </button>
              {activeSession.status === SCHEDULED_SESSION_STATUS.SCHEDULED && (
                <>
                  <button
                    type="button"
                    className="gold-button machined coach-primary-action"
                    disabled={completingSessionId === activeSession.id}
                    onClick={() => handleComplete(activeSession)}
                  >
                    {completingSessionId === activeSession.id
                      ? 'Completing…'
                      : 'Complete Session'}
                  </button>
                  {rescheduleMode ? (
                    <button
                      type="button"
                      className="coach-secondary-button"
                      onClick={() =>
                        handleReschedule(activeSession, {
                          sessionDate: rescheduleDraft.sessionDate,
                          startTime: rescheduleDraft.startTime,
                        }).then(() => setRescheduleMode(false))
                      }
                    >
                      Save New Time
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="coach-secondary-button"
                      onClick={() => {
                        setRescheduleDraft({
                          sessionDate: activeSession.sessionDate,
                          startTime: activeSession.startTime,
                        })
                        setRescheduleMode(true)
                      }}
                    >
                      Reschedule
                    </button>
                  )}
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={() => handleCancel(activeSession)}
                  >
                    Cancel Session
                  </button>
                </>
              )}
              {undoState?.session?.id === activeSession.id && (
                <button
                  type="button"
                  className="coach-session-inline-undo"
                  disabled={undoingSessionId === activeSession.id}
                  onClick={() =>
                    handleUndoCompletion(activeSession, undoState.undoSnapshot)
                  }
                >
                  {undoingSessionId === activeSession.id
                    ? 'Undoing…'
                    : 'Undo completion'}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
