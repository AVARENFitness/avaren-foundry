import {
  ArrowRight,
  Check,
  ChevronDown,
  Dumbbell,
  HeartPulse,
  Moon,
  Sun,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import WorkoutSelector from '../components/WorkoutSelector'
import AthleteAssignmentHome from '../components/AthleteAssignmentHome'
import { recentPRs, sessionVolume } from '../lib/metrics'

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
  return Number.isFinite(time) && Date.now() - time < days * DAY_MS
}

const compactNumber = (value) => {
  const number = Number(value || 0)
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`
  return Math.round(number).toLocaleString()
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
  onSelectWorkout,
  recoveryIntelligence,
  userName,
  readiness,
  onOpenReadiness,
  onOpenMobility,
  onOpenReset,
  mobilityTitle = 'Morning Movement',
  mobilityMinutes = 7,
  onStartCoachAssignment,
}) {
  const [showSelector, setShowSelector] = useState(false)

  const dashboard = useMemo(() => {
    const active = state.activeWorkout
    const now = new Date()
    const scheduledWorkout = state.weeklySchedule?.[now.getDay()]
    const isRestDay = scheduledWorkout === 'Rest'
    const defaultWorkout =
      scheduledWorkout && !isRestDay
        ? scheduledWorkout
        : state.program.nextWorkout
    const workoutName = active
      ? active.name
      : state.selectedWorkout || defaultWorkout

    const lastWorkout = [...state.history]
      .sort(
        (first, second) =>
          new Date(sessionDate(first)).getTime() -
          new Date(sessionDate(second)).getTime(),
      )
      .at(-1)

    const workoutsThisWeek = state.history.filter(
      (session) =>
        sessionDate(session) &&
        isWithinDays(sessionDate(session), 7),
    )

    const weeklyVolume = workoutsThisWeek.reduce(
      (total, session) => total + sessionVolume(session),
      0,
    )

    const weeklyPRs = recentPRs(state.history, 100).filter((pr) =>
      isWithinDays(`${pr.date}T12:00:00`, 7),
    )

    const firstName =
      userName?.trim()?.split(/\s+/)[0] || null

    return {
      active,
      isRestDay,
      workoutName,
      lastWorkout,
      workoutsThisWeek,
      weeklyVolume,
      weeklyPRs,
      workoutProgress: activeWorkoutProgress(active),
      greeting: `${greetingForHour(now.getHours())}${
        firstName ? `, ${firstName}` : ''
      }`,
      date: now.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    }
  }, [state, userName])

  const recovery = recoveryIntelligence ?? {
    score: 0,
    status: 'Profile building',
    insight:
      'Complete workouts and check-ins to build your profile.',
    tone: 'low',
  }

  const score = readiness?.completed
    ? readiness.score
    : recovery.score
  const scoreLabel = readiness?.completed
    ? 'Readiness'
    : 'Recovery'
  const scoreStatus = readiness?.completed
    ? readiness.status ?? 'Check-in complete'
    : recovery.status

  const mobilityCompleted = completedToday(
    state.mobility?.completed,
    'daily-reset',
  )
  const resetCompleted = completedToday(
    state.mobility?.completed,
    'recovery-flow',
  )

  const lastWorkoutContext = dashboard.active
    ? `${dashboard.active.name} is ${
        dashboard.workoutProgress?.percent ?? 0
      }% complete.`
    : dashboard.lastWorkout
    ? `Last workout: ${dashboard.lastWorkout.name} · ${Math.max(
        0,
        Math.round(
          (Date.now() -
            new Date(sessionDate(dashboard.lastWorkout)).getTime()) /
            DAY_MS,
        ),
      )} days ago`
    : 'Your training journal is ready.'

  return (
    <div className="home-v2">
      <section className={`home-readiness-first ${readiness?.completed ? 'complete' : 'pending'}`}>
        <div className="home-readiness-first-icon"><HeartPulse size={21} /></div>
        <div>
          <span className="eyebrow">TODAY’S READINESS</span>
          <h2>{readiness?.completed ? `${readiness.score} · ${readiness.status ?? 'Check-in complete'}` : 'Start with your check-in.'}</h2>
          <p>{readiness?.completed ? readiness.summary ?? 'Your readiness is recorded for today.' : 'Record sleep, soreness, energy, and stress before planning the rest of your day.'}</p>
        </div>
        <button className={readiness?.completed ? 'home-readiness-review' : 'gold-button machined'} onClick={onOpenReadiness}>
          {readiness?.completed ? 'Review' : 'Complete Check-In'} <ArrowRight size={16} />
        </button>
      </section>


      <AthleteAssignmentHome
        onStartAssignment={onStartCoachAssignment}
      />

      <section className="home-v2-hero">
        <div className="home-v2-orbit one" />
        <div className="home-v2-orbit two" />

        <div className="home-v2-heading">
          <div>
            <span className="eyebrow">{dashboard.date}</span>
            <h1>{dashboard.greeting}</h1>
            <p>{lastWorkoutContext}</p>
          </div>


        </div>

        <div className="home-v2-status">
          <span>{scoreStatus}</span>
          <p>
            {readiness?.completed
              ? readiness.summary ??
                'Your check-in is recorded for today.'
              : recovery.insight}
          </p>
        </div>

        <button
          className={`home-v2-workout-select ${
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
                ? 'Workout in progress'
                : dashboard.isRestDay
                ? 'Selected workout'
                : 'Workout'}
            </span>
            <strong>{dashboard.workoutName}</strong>
          </div>
          {!dashboard.active && <ChevronDown size={18} />}
        </button>

        {dashboard.workoutProgress && (
          <div className="home-v2-progress">
            <div>
              <span>
                {dashboard.workoutProgress.completed} of{' '}
                {dashboard.workoutProgress.total} sets
              </span>
              <strong>
                {dashboard.workoutProgress.percent}%
              </strong>
            </div>
            <div>
              <span
                style={{
                  width: `${dashboard.workoutProgress.percent}%`,
                }}
              />
            </div>
          </div>
        )}

        <button
          className="gold-button machined home-v2-primary"
          onClick={onStart}
        >
          <Dumbbell size={18} />
          {dashboard.active
            ? 'Continue Workout'
            : 'Start Workout'}
          <ArrowRight size={17} />
        </button>
      </section>

      <section className="home-v2-routines">
        <button
          onClick={onOpenMobility}
          className={mobilityCompleted ? 'complete' : ''}
        >
          <div className="home-v2-routine-icon">
            {mobilityCompleted ? (
              <Check size={18} />
            ) : (
              <Sun size={18} />
            )}
          </div>
          <div>
            <span>
              {mobilityCompleted
                ? 'Completed today'
                : 'Morning movement'}
            </span>
            <strong>{mobilityTitle}</strong>
            <small>
              {mobilityCompleted
                ? 'Ready again tomorrow'
                : `${mobilityMinutes} minutes`}
            </small>
          </div>
          <ArrowRight size={17} />
        </button>

        <button
          onClick={onOpenReset}
          className={resetCompleted ? 'complete' : ''}
        >
          <div className="home-v2-routine-icon">
            {resetCompleted ? (
              <Check size={18} />
            ) : (
              <Moon size={18} />
            )}
          </div>
          <div>
            <span>
              {resetCompleted ? 'Completed' : 'Daily reset'}
            </span>
            <strong>
              {resetCompleted
                ? 'Recovery logged'
                : 'Available when needed'}
            </strong>
            <small>Mobility and stretching</small>
          </div>
          <ArrowRight size={17} />
        </button>
      </section>

      <button
        className="home-v2-week"
        onClick={() => setScreen('progress')}
      >
        <header>
          <div>
            <span className="eyebrow">THIS WEEK</span>
            <h2>Training at a glance.</h2>
          </div>
          <ArrowRight size={18} />
        </header>

        <div>
          <article>
            <strong>{dashboard.workoutsThisWeek.length}</strong>
            <span>Workouts</span>
          </article>
          <article>
            <strong>{compactNumber(dashboard.weeklyVolume)}</strong>
            <span>Volume</span>
          </article>
          <article>
            <strong>{dashboard.weeklyPRs.length}</strong>
            <span>PRs</span>
          </article>
        </div>
      </button>

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
