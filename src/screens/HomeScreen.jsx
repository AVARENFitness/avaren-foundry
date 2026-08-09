import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  Check,
  ChevronRight,
  HeartPulse,
  Moon,
  Sun,
  Utensils,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAvaUi } from '../ava/useAvaUi'
import AthleteAssignmentHome from '../components/AthleteAssignmentHome'
import AvaDailyBriefing from '../components/AvaDailyBriefing'
import { buildAvaDailyBriefing } from '../lib/avaIntelligence'
import { AVA_ACTION_TYPES } from '../lib/avaActions'
import { coachBackend } from '../lib/coachBackend'
import { resolveActiveCoachAssignment } from '../lib/coachAssignments'
import { recentPRs, sessionVolume } from '../lib/metrics'
import { resolveTodayWorkoutContext } from '../lib/todayWorkout'
import { isWeeklyCheckInDue } from '../lib/weeklyCheckIn'
import { buildPlanningOwnership, coachOwnershipLabel } from '../lib/planOwnership'
import {
  executionPlanSummaryLabel,
  isExecutionPlanCurrent,
} from '../lib/sessionExecutionPlan'
import {
  hasScheduledInPersonToday,
  resolveSessionMode,
  sessionModeLabel,
} from '../lib/sessionMode'

const DAY_MS = 86400000

const greetingForHour = (hour) => {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const sessionDate = (session) =>
  session?.finishedAt ??
  (session?.date ? `${session.date}T12:00:00` : null)

const completedToday = (completions = [], flowId) => {
  const today = new Date().toISOString().slice(0, 10)
  return completions.some((item) => {
    const date = String(item?.completedAt ?? '').slice(0, 10)
    return date === today && (!flowId || item?.flowId === flowId)
  })
}

export default function HomeScreen({
  state,
  onStart,
  setScreen,
  recoveryIntelligence,
  userName,
  readiness,
  onOpenReadiness,
  onOpenMobility,
  onOpenReset,
  mobilityTitle = 'Morning Movement',
  mobilityMinutes = 7,
  onStartCoachAssignment,
  nutritionSummary,
  showCoachHubShortcut = false,
  onOpenCoachHub,
  weeklyCheckInStatus = null,
  currentWeeklyCheckInState = null,
  onOpenWeeklyCheckIn,
  weeklyCheckInConfirmation = false,
}) {
  const { openAva } = useAvaUi()
  const [assignments, setAssignments] = useState([])
  const [scheduledSessions, setScheduledSessions] = useState([])

  useEffect(() => {
    coachBackend
      .listAthleteAssignments()
      .then(setAssignments)
      .catch(() => {})
    coachBackend
      .listAthleteScheduledSessions()
      .then(setScheduledSessions)
      .catch(() => {})
  }, [])

  const activeCoachAssignment = useMemo(
    () => resolveActiveCoachAssignment(assignments),
    [assignments],
  )

  const avaBriefing = useMemo(
    () =>
      buildAvaDailyBriefing(state, {
        assignments,
        activeCoachAssignment,
        userName,
        weeklyCheckInState: currentWeeklyCheckInState,
      }),
    [state, assignments, activeCoachAssignment, userName, currentWeeklyCheckInState],
  )

  const dashboard = useMemo(() => {
    const now = new Date()
    const workoutContext = resolveTodayWorkoutContext(state, {
      now,
      assignments,
      activeCoachAssignment,
    })
    const isRestDay = workoutContext.isRestDay
    const workoutName =
      state.activeWorkout?.name ||
      workoutContext.displayName ||
      null
    const firstName = userName?.trim()?.split(/\s+/)[0] || null
    const workoutsThisWeek = state.history.filter((session) => {
      const date = sessionDate(session)
      return date && Date.now() - new Date(date).getTime() < 7 * DAY_MS
    })
    const weeklyVolume = workoutsThisWeek.reduce(
      (total, session) => total + sessionVolume(session),
      0,
    )
    const weeklyPRs = recentPRs(state.history, 100).filter(
      (pr) =>
        Date.now() - new Date(`${pr.date}T12:00:00`).getTime() <
        7 * DAY_MS,
    )

    const coachOwnership = buildPlanningOwnership({
      todayWorkout: workoutContext,
      activeAssignment: activeCoachAssignment,
      hasCoachRelationship: Boolean(assignments.length),
    })
    const executionFocusLabel = isExecutionPlanCurrent(state.sessionExecutionPlan)
      ? executionPlanSummaryLabel(state.sessionExecutionPlan)
      : null
    const inPersonToday = hasScheduledInPersonToday(scheduledSessions)
    const sessionMode = resolveSessionMode({
      assignmentId: activeCoachAssignment?.id ?? null,
      coachAssigned: Boolean(activeCoachAssignment),
      inPersonToday,
    })
    const coachedSessionLabel = sessionModeLabel(sessionMode)

    return {
      greeting: `${greetingForHour(now.getHours())}${firstName ? `, ${firstName}` : ''}`,
      date: now.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
      workoutName,
      isRestDay,
      coachLabel: coachedSessionLabel ?? coachOwnershipLabel(coachOwnership),
      inPersonToday,
      sessionMode,
      executionFocusLabel,
      workouts: workoutsThisWeek.length,
      volume: Math.round(weeklyVolume),
      prs: weeklyPRs.length,
    }
  }, [state, userName, assignments, activeCoachAssignment, scheduledSessions])

  const readinessScore = readiness?.completed
    ? readiness.score
    : recoveryIntelligence?.score ?? 0
  const readinessLabel = readiness?.completed
    ? readiness.status ?? 'Ready'
    : "Complete today's readiness"
  const movementDone = completedToday(
    state.mobility?.completed,
    'daily-reset',
  )
  const resetDone = completedToday(
    state.mobility?.completed,
    'recovery-flow',
  )

  const dailyPreview = [
    readiness?.completed
      ? `${readinessScore} readiness`
      : 'Readiness pending',
    `${nutritionSummary?.calories || 0} cal logged`,
  ].join(' · ')

  const weeklyCheckInDue = isWeeklyCheckInDue(currentWeeklyCheckInState)
  const readinessDue = !readiness?.completed

  const handleAvaAction = (action) => {
    if (!action) return

    switch (action.type) {
      case AVA_ACTION_TYPES.CONTINUE_WORKOUT:
      case AVA_ACTION_TYPES.START_WORKOUT: {
        const assignmentId = action.meta?.assignmentId
        if (assignmentId && activeCoachAssignment?.id === assignmentId) {
          onStartCoachAssignment?.(activeCoachAssignment)
          return
        }
        onStart()
        return
      }
      case AVA_ACTION_TYPES.MORNING_MOVEMENT:
        onOpenMobility()
        return
      case AVA_ACTION_TYPES.RECOVERY_FLOW:
        onOpenReset()
        return
      case AVA_ACTION_TYPES.CHECK_READINESS:
      case AVA_ACTION_TYPES.BUILD_BASELINE:
        onOpenReadiness()
        return
      case AVA_ACTION_TYPES.OPEN_WEEKLY_CHECKIN:
        onOpenWeeklyCheckIn?.()
        return
      case AVA_ACTION_TYPES.VIEW_PLAN:
        setScreen('train')
        return
      default:
        break
    }
  }

  return (
    <div className="home-3">
      <header className="home-3-header home-3-header--quiet">
        <span className="eyebrow">{dashboard.date}</span>
        <h1>{dashboard.greeting}</h1>
      </header>

      {showCoachHubShortcut && (
        <button
          type="button"
          className="home-coach-hub-shortcut"
          onClick={onOpenCoachHub}
        >
          <span className="home-coach-hub-shortcut-icon">
            <BriefcaseBusiness size={18} strokeWidth={1.75} />
          </span>
          <span className="home-coach-hub-shortcut-copy">
            <strong>Coach Hub</strong>
            <span>Clients, reviews, and assignments</span>
          </span>
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      )}

      <AvaDailyBriefing
        briefing={avaBriefing}
        onAction={handleAvaAction}
        onAskAva={openAva}
      />

      <section className="home-today-plan">
        <span className="eyebrow">TODAY</span>
        {dashboard.isRestDay && !activeCoachAssignment ? (
          <>
            <h2>Rest day</h2>
            <p>Your schedule calls for recovery today.</p>
          </>
        ) : dashboard.workoutName ? (
          <>
            {dashboard.coachLabel ? (
              <span className="home-coach-ownership eyebrow">{dashboard.coachLabel}</span>
            ) : null}
            <h2>{dashboard.workoutName}</h2>
            {dashboard.inPersonToday ? (
              <p className="home-in-person-note">In-person session today</p>
            ) : null}
            {dashboard.executionFocusLabel ? (
              <p className="home-execution-focus">{dashboard.executionFocusLabel} active</p>
            ) : null}
            <p>
              {activeCoachAssignment
                ? 'Your coach programmed this session.'
                : 'Scheduled on your weekly plan.'}
            </p>
            {(activeCoachAssignment || state.activeWorkout) && (
              <button
                type="button"
                className="gold-button machined home-start-session"
                onClick={() => {
                  if (activeCoachAssignment) {
                    onStartCoachAssignment?.(activeCoachAssignment)
                    return
                  }
                  onStart()
                }}
              >
                {state.activeWorkout ? 'Continue Session' : 'Start Session'}
              </button>
            )}
          </>
        ) : (
          <>
            <h2>Open schedule</h2>
            <p>Review your week and choose the next session that fits.</p>
          </>
        )}
        <button
          type="button"
          className="home-today-plan-link"
          onClick={() => setScreen('train')}
        >
          View schedule
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </section>

      <div className="home-assignment-slot">
        {!activeCoachAssignment && (
          <AthleteAssignmentHome
            compact
            onStartAssignment={onStartCoachAssignment}
          />
        )}
      </div>

      {weeklyCheckInConfirmation && (
        <p className="home-weekly-checkin-confirmation" role="status">
          Weekly check-in sent
        </p>
      )}

      {(readinessDue || weeklyCheckInDue) && (
        <section className="home-reminders" aria-label="Essentials">
          {readinessDue && (
            <button
              type="button"
              className="home-reminder-row home-reminder-row--daily"
              onClick={onOpenReadiness}
            >
              <HeartPulse size={18} strokeWidth={1.75} />
              <div>
                <span className="home-reminder-eyebrow">DAILY READINESS</span>
                <strong>How are you today?</strong>
                <span>Quick check-in for today&apos;s training context.</span>
              </div>
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          )}

          {weeklyCheckInDue && (
            <div className="home-reminder-row home-reminder-row--weekly">
              <CalendarCheck2 size={18} strokeWidth={1.75} />
              <div>
                <span className="home-reminder-eyebrow">WEEKLY CHECK-IN</span>
                <strong>Give your coach a quick read on your week.</strong>
              </div>
              <button
                type="button"
                className="home-reminder-action"
                onClick={onOpenWeeklyCheckIn}
              >
                Check In
              </button>
            </div>
          )}
        </section>
      )}

      <details className="foundry-disclosure home-daily-panel">
        <summary>
          <span>Daily essentials</span>
          <small>{dailyPreview}</small>
        </summary>

        <div className="home-daily-list">
          <button className="home-daily-row" onClick={onOpenReadiness}>
            <HeartPulse size={18} />
            <div>
              <strong>Readiness</strong>
              <span>
                {readiness?.completed
                  ? `${readinessScore} · ${readinessLabel}`
                  : readinessLabel}
              </span>
            </div>
            <ChevronRight size={16} />
          </button>

          <button
            className="home-daily-row"
            onClick={() => setScreen('nutrition')}
          >
            <Utensils size={18} />
            <div>
              <strong>Nutrition</strong>
              <span>
                {nutritionSummary?.calories || 0} /{' '}
                {nutritionSummary?.goal || 2200} cal ·{' '}
                {nutritionSummary?.protein || 0}g protein
              </span>
            </div>
            <ChevronRight size={16} />
          </button>

          <button
            className={`home-daily-row ${movementDone ? 'is-complete' : ''}`}
            onClick={onOpenMobility}
          >
            {movementDone ? <Check size={18} /> : <Sun size={18} />}
            <div>
              <strong>Movement</strong>
              <span>
                {movementDone
                  ? 'Complete'
                  : `${mobilityMinutes} min · ${mobilityTitle}`}
              </span>
            </div>
            <ChevronRight size={16} />
          </button>

          <button
            className={`home-daily-row ${resetDone ? 'is-complete' : ''}`}
            onClick={onOpenReset}
          >
            {resetDone ? <Check size={18} /> : <Moon size={18} />}
            <div>
              <strong>Recovery</strong>
              <span>
                {resetDone ? 'Complete' : 'Mobility and stretching'}
              </span>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </details>

      <details className="foundry-disclosure home-week-panel">
        <summary>
          <span>This week</span>
          <small>
            {dashboard.workouts} workouts ·{' '}
            {dashboard.volume.toLocaleString()} lb · {dashboard.prs} PRs
          </small>
        </summary>

        <div className="home-week-stats">
          <article>
            <strong>{dashboard.workouts}</strong>
            <span>Workouts</span>
          </article>
          <article>
            <strong>{dashboard.volume.toLocaleString()}</strong>
            <span>Volume</span>
          </article>
          <article>
            <strong>{dashboard.prs}</strong>
            <span>PRs</span>
          </article>
        </div>

        <button
          className="home-week-link"
          onClick={() => setScreen('progress')}
        >
          View full progress
          <ArrowRight size={16} />
        </button>
      </details>
    </div>
  )
}
