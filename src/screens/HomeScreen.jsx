import {
  ArrowRight,
  Check,
  Dumbbell,
  HeartPulse,
  Moon,
  Sparkles,
  Sun,
  Utensils,
} from 'lucide-react'
import { useMemo } from 'react'
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
}) {
  const dashboard = useMemo(() => {
    const now = new Date()
    const scheduledWorkout = state.weeklySchedule?.[now.getDay()]
    const isRestDay = scheduledWorkout === 'Rest'
    const workoutName = state.activeWorkout?.name || state.selectedWorkout || (!isRestDay ? scheduledWorkout : null) || state.program?.nextWorkout
    const firstName = userName?.trim()?.split(/\s+/)[0] || null
    const workoutsThisWeek = state.history.filter((session) => {
      const date = sessionDate(session)
      return date && Date.now() - new Date(date).getTime() < 7 * DAY_MS
    })
    const weeklyVolume = workoutsThisWeek.reduce((total, session) => total + sessionVolume(session), 0)
    const weeklyPRs = recentPRs(state.history, 100).filter((pr) => Date.now() - new Date(`${pr.date}T12:00:00`).getTime() < 7 * DAY_MS)

    return {
      greeting: `${greetingForHour(now.getHours())}${firstName ? `, ${firstName}` : ''}`,
      date: now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }),
      workoutName,
      isRestDay,
      workouts: workoutsThisWeek.length,
      volume: Math.round(weeklyVolume),
      prs: weeklyPRs.length,
    }
  }, [state, userName])

  const readinessScore = readiness?.completed ? readiness.score : recoveryIntelligence?.score ?? 0
  const readinessLabel = readiness?.completed ? readiness.status ?? 'Ready' : 'Check in'
  const movementDone = completedToday(state.mobility?.completed, 'daily-reset')
  const resetDone = completedToday(state.mobility?.completed, 'recovery-flow')

  return (
    <div className="home-3">
      <header className="home-3-header">
        <div>
          <span className="eyebrow">{dashboard.date}</span>
          <h1>{dashboard.greeting}</h1>
          <p>Your training, nutrition, recovery, and progress—organized around today.</p>
        </div>
      </header>

      <AthleteAssignmentHome onStartAssignment={onStartCoachAssignment} />

      <section className="home-3-workout">
        <div>
          <span className="eyebrow">TODAY’S TRAINING</span>
          <h2>{state.activeWorkout ? state.activeWorkout.name : dashboard.isRestDay ? 'Recovery Day' : dashboard.workoutName}</h2>
          <p>{state.activeWorkout ? 'Your workout is in progress.' : dashboard.isRestDay ? 'Your schedule calls for recovery today. You can still choose a workout.' : 'Your selected session is ready.'}</p>
        </div>
        <button className="gold-button machined" onClick={onStart}>
          <Dumbbell size={18}/>
          {state.activeWorkout ? 'Continue Workout' : 'Start Workout'}
          <ArrowRight size={17}/>
        </button>
      </section>

      <section className="home-3-dashboard">
        <button className="home-3-dashboard-card readiness" onClick={onOpenReadiness}>
          <div><HeartPulse size={20}/><span>Readiness</span></div>
          <strong>{readiness?.completed ? readinessScore : 'Check in'}</strong>
          <small>{readinessLabel}</small>
        </button>

        <button className="home-3-dashboard-card nutrition" onClick={() => setScreen('nutrition')}>
          <div><Utensils size={20}/><span>Nutrition</span></div>
          <strong>Set up</strong>
          <small>Food, macros, water, weight</small>
        </button>

        <button className={`home-3-dashboard-card ${movementDone ? 'done' : ''}`} onClick={onOpenMobility}>
          <div>{movementDone ? <Check size={20}/> : <Sun size={20}/>}<span>Movement</span></div>
          <strong>{movementDone ? 'Complete' : `${mobilityMinutes} min`}</strong>
          <small>{mobilityTitle}</small>
        </button>

        <button className={`home-3-dashboard-card ${resetDone ? 'done' : ''}`} onClick={onOpenReset}>
          <div>{resetDone ? <Check size={20}/> : <Moon size={20}/>}<span>Recovery</span></div>
          <strong>{resetDone ? 'Complete' : 'Reset'}</strong>
          <small>Mobility and stretching</small>
        </button>
      </section>

      <section className="home-3-week">
        <header>
          <div>
            <span className="eyebrow">THIS WEEK</span>
            <h2>Progress at a glance.</h2>
          </div>
          <button onClick={() => setScreen('progress')}>View Progress <ArrowRight size={16}/></button>
        </header>
        <div>
          <article><strong>{dashboard.workouts}</strong><span>Workouts</span></article>
          <article><strong>{dashboard.volume.toLocaleString()}</strong><span>Volume</span></article>
          <article><strong>{dashboard.prs}</strong><span>PRs</span></article>
        </div>
      </section>

      <section className="home-3-next">
        <Sparkles size={19}/>
        <div><strong>Everything important stays close.</strong><span>Use Train, Nutrition, Progress, and Account for deeper tools.</span></div>
      </section>
    </div>
  )
}
