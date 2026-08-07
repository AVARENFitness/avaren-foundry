import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Dumbbell,
  HeartPulse,
  Moon,
  Sun,
  Utensils,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import AthleteAssignmentHome from '../components/AthleteAssignmentHome'
import TodaysFocusWhySheet from '../components/TodaysFocusWhySheet'
import { coachBackend } from '../lib/coachBackend'
import { recentPRs, sessionVolume } from '../lib/metrics'
import {
  assignmentDueToday,
  deriveTodaysFocus,
  FOCUS_ACTIONS,
} from '../lib/todaysFocus'

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
}) {
  const [showWhySheet, setShowWhySheet] = useState(false)
  const [assignments, setAssignments] = useState([])

  useEffect(() => {
    coachBackend
      .listAthleteAssignments()
      .then(setAssignments)
      .catch(() => {})
  }, [])

  const dueTodayAssignment = useMemo(
    () => assignmentDueToday(assignments),
    [assignments],
  )

  const todaysFocus = useMemo(
    () =>
      deriveTodaysFocus(state, {
        assignmentDueToday: dueTodayAssignment,
      }),
    [state, dueTodayAssignment],
  )

  const dashboard = useMemo(() => {
    const now = new Date()
    const scheduledWorkout = state.weeklySchedule?.[now.getDay()]
    const isRestDay = scheduledWorkout === 'Rest'
    const workoutName =
      state.activeWorkout?.name ||
      state.selectedWorkout ||
      (!isRestDay ? scheduledWorkout : null) ||
      state.program?.nextWorkout
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

    return {
      greeting: `${greetingForHour(now.getHours())}${firstName ? `, ${firstName}` : ''}`,
      date: now.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
      workoutName,
      isRestDay,
      workouts: workoutsThisWeek.length,
      volume: Math.round(weeklyVolume),
      prs: weeklyPRs.length,
    }
  }, [state, userName])

  const readinessScore = readiness?.completed
    ? readiness.score
    : recoveryIntelligence?.score ?? 0
  const readinessLabel = readiness?.completed
    ? readiness.status ?? 'Ready'
    : 'Check in'
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

  const handleFocusAction = () => {
    switch (todaysFocus.action) {
      case FOCUS_ACTIONS.CONTINUE_WORKOUT:
      case FOCUS_ACTIONS.START_WORKOUT:
        if (
          dueTodayAssignment &&
          todaysFocus.meta?.assignmentId === dueTodayAssignment.id
        ) {
          onStartCoachAssignment?.(dueTodayAssignment)
          return
        }
        onStart()
        return
      case FOCUS_ACTIONS.BEGIN_RECOVERY:
        onOpenReset()
        return
      case FOCUS_ACTIONS.LOG_FOOD:
        setScreen('nutrition')
        return
      case FOCUS_ACTIONS.CHECK_IN:
        onOpenReadiness()
        return
      case FOCUS_ACTIONS.VIEW_TODAY:
        setScreen('train')
        return
      default:
        onStart()
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

      <section
        className={`todays-focus-hero todays-focus-hero--${todaysFocus.type}`}
      >
        <div className="todays-focus-copy">
          <span className="eyebrow">TODAY&apos;S FOCUS</span>
          <h2>{todaysFocus.title}</h2>
          <p>{todaysFocus.explanation}</p>
        </div>

        <div className="todays-focus-actions">
          <button
            type="button"
            className="gold-button machined todays-focus-primary"
            onClick={handleFocusAction}
          >
            {todaysFocus.action === FOCUS_ACTIONS.CONTINUE_WORKOUT ||
            todaysFocus.action === FOCUS_ACTIONS.START_WORKOUT ? (
              <Dumbbell size={18} />
            ) : null}
            {todaysFocus.actionLabel}
            <ArrowRight size={17} />
          </button>
          <button
            type="button"
            className="todays-focus-why-trigger"
            onClick={() => setShowWhySheet(true)}
          >
            Why this?
          </button>
        </div>
      </section>

      <TodaysFocusWhySheet
        open={showWhySheet}
        focus={todaysFocus}
        onClose={() => setShowWhySheet(false)}
      />

      <div className="home-assignment-slot">
        <AthleteAssignmentHome
          compact
          onStartAssignment={onStartCoachAssignment}
        />
      </div>

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
