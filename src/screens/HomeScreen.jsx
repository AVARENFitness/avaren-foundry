import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Dumbbell,
  Flame,
  Hammer,
  HeartPulse,
  History,
  Layers3,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import CoachCard from '../components/CoachCard'
import WeeklyTrainingStrip from '../components/WeeklyTrainingStrip'
import ReadinessCard from '../components/ReadinessCard'
import NotificationPreview from '../components/NotificationPreview'
import WorkoutSelector from '../components/WorkoutSelector'
import { forgeSnapshot } from '../lib/forge'
import {
  recentPRs,
  totalSets,
  totalVolume,
} from '../lib/metrics'

const DAY_MS = 86400000

const greetingForHour = (hour) => {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const sessionDate = (session) =>
  session?.finishedAt ??
  (session?.date ? `${session.date}T12:00:00` : null)

const isWithinDays = (value, days) => {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  return Date.now() - time < days * DAY_MS
}

const sessionVolume = (session) =>
  (session?.sets ?? []).reduce(
    (total, set) =>
      total +
      Number(set?.weight || 0) *
        Number(set?.reps || 0),
    0,
  )

const compactNumber = (value) => {
  const number = Number(value || 0)
  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(1)}M`
  }
  if (number >= 1_000) {
    return `${(number / 1_000).toFixed(1)}K`
  }
  return Math.round(number).toLocaleString()
}

const formatDate = (value) => {
  if (!value) return 'No completed workout yet'

  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

const activeWorkoutProgress = (activeWorkout) => {
  if (!activeWorkout) return null

  const sets = activeWorkout.exercises.flatMap(
    (exercise) => exercise.sets ?? [],
  )
  const completed = sets.filter((set) => set.done).length

  return {
    completed,
    total: sets.length,
    percent: sets.length
      ? Math.round((completed / sets.length) * 100)
      : 0,
  }
}

export default function HomeScreen({
  state,
  onStart,
  setScreen,
  onSelectWorkout,
  recoveryIntelligence,
  coachInsight,
  onCoachAction,
  onCoachInsightSeen,
  userName,
  readiness,
  onOpenReadiness,
  onOpenReadinessTrends,
  notificationSnapshot,
  onOpenNotifications,
}) {
  const [showSelector, setShowSelector] = useState(false)

  const dashboard = useMemo(() => {
    const active = state.activeWorkout
    const now = new Date()
    const scheduledWorkout =
      state.weeklySchedule?.[now.getDay()]
    const isRestDay = scheduledWorkout === 'Rest'
    const defaultWorkout =
      scheduledWorkout && !isRestDay
        ? scheduledWorkout
        : state.program.nextWorkout
    const workoutName = active
      ? active.name
      : state.selectedWorkout || defaultWorkout

    const orderedHistory = [...state.history].sort(
      (first, second) =>
        new Date(sessionDate(first)).getTime() -
        new Date(sessionDate(second)).getTime(),
    )
    const lastWorkout = orderedHistory.at(-1) ?? null

    const workoutsThisWeek = state.history.filter(
      (session) =>
        sessionDate(session) &&
        isWithinDays(sessionDate(session), 7),
    )

    const weeklyVolume = workoutsThisWeek.reduce(
      (total, session) => total + sessionVolume(session),
      0,
    )

    const prs = recentPRs(state.history, 8)
    const latestPr = prs[0] ?? null
    const forge = forgeSnapshot(state)
    const nextAchievement = forge.closest[0] ?? null
    const workoutProgress = activeWorkoutProgress(active)

    const firstName =
      userName?.trim()?.split(/\s+/)[0] || null

    const greeting = `${greetingForHour(now.getHours())}${
      firstName ? `, ${firstName}` : ''
    }`

    let focusLabel = workoutName
    let focusTitle = 'Ready to train.'
    let focusCopy = 'Your next session is ready when you are.'

    if (active) {
      focusLabel = 'Workout in progress'
      focusTitle = 'Continue where you left off.'
      focusCopy = `${active.name} is ${
        workoutProgress?.percent ?? 0
      }% complete.`
    } else if (isRestDay) {
      focusLabel = 'Recovery day'
      focusTitle = 'Recovery is training too.'
      focusCopy =
        'A rest day is scheduled. You can still override it and train.'
    }

    return {
      active,
      scheduledWorkout,
      isRestDay,
      workoutName,
      workoutProgress,
      lastWorkout,
      workoutsThisWeek,
      weeklyVolume,
      latestPr,
      forge,
      nextAchievement,
      greeting,
      focusLabel,
      focusTitle,
      focusCopy,
    }
  }, [state, userName])

  const recovery = recoveryIntelligence ?? {
    score: 0,
    status: 'Recovery profile building',
    insight:
      'Complete workouts and mobility flows to build your recovery profile.',
    tone: 'low',
  }

  const weeklyTarget = Math.max(
    1,
    Object.values(state.weeklySchedule ?? {}).filter(
      (workout) => workout && workout !== 'Rest',
    ).length,
  )
  const weeklyPercent = Math.min(
    100,
    Math.round(
      (dashboard.workoutsThisWeek.length / weeklyTarget) *
        100,
    ),
  )

  return (
    <div className="home-dashboard">
      <section className="home-welcome">
        <span className="eyebrow">TODAY IN THE FOUNDRY</span>
        <h1>{dashboard.greeting}</h1>
        <p>
          Train with purpose, recover intentionally, and
          keep building.
        </p>
      </section>

      <ReadinessCard
        readiness={readiness}
        onOpen={onOpenReadiness}
        onOpenTrends={onOpenReadinessTrends}
      />

      <NotificationPreview
        snapshot={notificationSnapshot}
        onOpen={onOpenNotifications}
      />

      <section className="home-focus-card">
        <div className="home-focus-orbit one" />
        <div className="home-focus-orbit two" />

        <div className="home-focus-head">
          <div>
            <span className="eyebrow">
              {dashboard.focusLabel}
            </span>
            <h2>{dashboard.focusTitle}</h2>
            <p>{dashboard.focusCopy}</p>
          </div>

          <div
            className={`home-readiness-badge ${
              readiness?.completed
                ? readiness.tone
                : recovery.tone
            }`}
          >
            <HeartPulse size={16} />
            <strong>
              {readiness?.completed
                ? readiness.score
                : recovery.score}
            </strong>
            <span>
              {readiness?.completed
                ? 'Readiness'
                : 'Recovery'}
            </span>
          </div>
        </div>

        <button
          className={`home-workout-selector ${
            dashboard.active ? 'locked' : ''
          }`}
          onClick={() =>
            !dashboard.active && setShowSelector(true)
          }
          disabled={Boolean(dashboard.active)}
        >
          <div>
            <span>
              {dashboard.active
                ? 'Current workout'
                : 'Today’s workout'}
            </span>
            <strong>{dashboard.workoutName}</strong>
          </div>
          {!dashboard.active && <ChevronDown size={18} />}
        </button>

        {dashboard.workoutProgress && (
          <div className="home-active-progress">
            <div>
              <span>
                {dashboard.workoutProgress.completed} of{' '}
                {dashboard.workoutProgress.total} sets complete
              </span>
              <strong>
                {dashboard.workoutProgress.percent}%
              </strong>
            </div>
            <div className="home-progress-track">
              <div
                style={{
                  width: `${dashboard.workoutProgress.percent}%`,
                }}
              />
            </div>
          </div>
        )}

        <button
          className="gold-button machined home-primary-action"
          onClick={onStart}
          aria-label={
            dashboard.active
              ? 'Resume active workout'
              : 'Start today’s workout'
          }
        >
          <Dumbbell size={18} />
          {dashboard.active
            ? 'Resume Workout'
            : dashboard.isRestDay
            ? 'Train Anyway'
            : 'Start Today’s Workout'}
          <ArrowRight size={17} />
        </button>
      </section>

      <CoachCard
        insight={coachInsight}
        onAction={onCoachAction}
        onSeen={onCoachInsightSeen}
      />

      <section className="home-intelligence-grid">
        <article
          className={`home-dashboard-card recovery ${recovery.tone}`}
        >
          <header>
            <div className="home-card-icon">
              <HeartPulse size={19} />
            </div>
            <span>Recovery</span>
          </header>
          <div className="home-score-row">
            <strong>{recovery.score}</strong>
            <div>
              <span>{recovery.status}</span>
              <small>{recovery.insight}</small>
            </div>
          </div>
        </article>

        <button
          className="home-dashboard-card forge"
          onClick={() => setScreen('forge')}
        >
          <header>
            <div className="home-card-icon">
              <Hammer size={19} />
            </div>
            <span>Next in The Forge</span>
          </header>

          {dashboard.nextAchievement ? (
            <>
              <strong>
                {dashboard.nextAchievement.title}
              </strong>
              <small>
                {dashboard.nextAchievement.description}
              </small>
              <div className="home-card-progress-copy">
                <span>
                  {dashboard.nextAchievement.percent}% forged
                </span>
                <span>
                  {compactNumber(
                    dashboard.nextAchievement.remaining,
                  )}{' '}
                  remaining
                </span>
              </div>
              <div className="home-progress-track">
                <div
                  style={{
                    width: `${dashboard.nextAchievement.percent}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <strong>Every achievement forged.</strong>
              <small>
                Your current Forge catalog is complete.
              </small>
            </>
          )}
        </button>
      </section>

      <WeeklyTrainingStrip
        state={state}
        onOpenPlanner={() => setScreen('planner')}
      />

      <section className="home-week-card">
        <header>
          <div>
            <span className="eyebrow">THIS WEEK</span>
            <h2>Training momentum.</h2>
          </div>
          <strong>{weeklyPercent}%</strong>
        </header>

        <div className="home-week-track">
          <div style={{ width: `${weeklyPercent}%` }} />
        </div>

        <div className="home-week-stats">
          <article>
            <Dumbbell size={16} />
            <span>Workouts</span>
            <strong>
              {dashboard.workoutsThisWeek.length} /{' '}
              {weeklyTarget}
            </strong>
          </article>
          <article>
            <Layers3 size={16} />
            <span>Lifetime sets</span>
            <strong>
              {compactNumber(totalSets(state.history))}
            </strong>
          </article>
          <article>
            <Flame size={16} />
            <span>Weekly volume</span>
            <strong>
              {compactNumber(dashboard.weeklyVolume)} lb
            </strong>
          </article>
          <article>
            <Trophy size={16} />
            <span>Lifetime volume</span>
            <strong>
              {compactNumber(totalVolume(state.history))} lb
            </strong>
          </article>
        </div>
      </section>

      <section className="home-recent-grid">
        <button
          className="home-recent-card"
          onClick={() => setScreen('history')}
        >
          <header>
            <History size={18} />
            <span>Last workout</span>
            <ArrowRight size={15} />
          </header>

          {dashboard.lastWorkout ? (
            <>
              <strong>{dashboard.lastWorkout.name}</strong>
              <small>
                {formatDate(
                  sessionDate(dashboard.lastWorkout),
                )}{' '}
                · {dashboard.lastWorkout.sets?.length ?? 0}{' '}
                sets ·{' '}
                {compactNumber(
                  sessionVolume(dashboard.lastWorkout),
                )}{' '}
                lb
              </small>
            </>
          ) : (
            <>
              <strong>Your Journey starts here.</strong>
              <small>
                Complete a workout to create your first
                entry.
              </small>
            </>
          )}
        </button>

        <button
          className="home-recent-card"
          onClick={() => setScreen('progress')}
        >
          <header>
            <Sparkles size={18} />
            <span>Latest PR</span>
            <ArrowRight size={15} />
          </header>

          {dashboard.latestPr ? (
            <>
              <strong>{dashboard.latestPr.exercise}</strong>
              <small>
                {dashboard.latestPr.value} ·{' '}
                {dashboard.latestPr.type}
              </small>
            </>
          ) : (
            <>
              <strong>No PR recorded yet.</strong>
              <small>
                Your first completed workouts will begin the
                PR timeline.
              </small>
            </>
          )}
        </button>
      </section>

      <section className="home-quick-actions">
        <button onClick={() => setScreen('gym')}>
          <Dumbbell />
          <span>Gym Mode</span>
          <ArrowRight />
        </button>
        <button onClick={() => setScreen('progress')}>
          <Flame />
          <span>My Training</span>
          <ArrowRight />
        </button>
        <button onClick={() => setScreen('forge')}>
          <Hammer />
          <span>The Forge</span>
          <ArrowRight />
        </button>
        <button onClick={() => setScreen('planner')}>
          <CalendarDays />
          <span>Weekly Plan</span>
          <ArrowRight />
        </button>
      </section>

      {showSelector && !dashboard.active && (
        <WorkoutSelector
          workouts={state.program.rotation}
          selectedWorkout={dashboard.workoutName}
          onClose={() => setShowSelector(false)}
          onSelect={(workout) => {
            onSelectWorkout(workout)
            setShowSelector(false)
          }}
          onOpenBuilder={() => {
            setShowSelector(false)
            setScreen('builder')
          }}
        />
      )}
    </div>
  )
}
