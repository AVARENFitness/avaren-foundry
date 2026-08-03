import { ArrowRight, ChevronDown, Dumbbell, Flame, HeartPulse, Layers3, Trophy } from 'lucide-react'
import { useState } from 'react'
import MetricCard from '../components/MetricCard'
import CoachCard from '../components/CoachCard'
import WorkoutSelector from '../components/WorkoutSelector'
import { totalSets, totalVolume } from '../lib/metrics'

export default function HomeScreen({
  state,
  onStart,
  setScreen,
  onSelectWorkout,
  recoveryIntelligence,
  coachInsight,
  onCoachAction,
  onCoachInsightSeen,
}) {
  const [showSelector, setShowSelector] = useState(false)
  const active = state.activeWorkout
  const scheduledWorkout = state.weeklySchedule?.[new Date().getDay()]
  const defaultWorkout =
    scheduledWorkout && scheduledWorkout !== 'Rest'
      ? scheduledWorkout
      : state.program.nextWorkout
  const workoutName = active
    ? active.name
    : state.selectedWorkout || defaultWorkout


  const recovery = recoveryIntelligence ?? {
    score: 0,
    status: 'Recovery profile building',
    insight: 'Complete workouts and mobility flows to build your recovery profile.',
    tone: 'low',
  }

  return (
    <>
      <CoachCard
        insight={coachInsight}
        onAction={onCoachAction}
        onSeen={onCoachInsightSeen}
      />

      <section className="hero-card luxury-surface">
        <div className="hero-noise" />
        <div className="hero-orbit one" />
        <div className="hero-orbit two" />

        <span className="eyebrow">{active ? 'WORKOUT IN PROGRESS' : workoutName}</span>
        <h1>{active ? 'Continue.' : 'Ready.'}</h1>
        <p>
          {active
            ? 'Return to the set that matters.'
            : scheduledWorkout === 'Rest' && !state.selectedWorkout
            ? 'A recovery day is scheduled. Override it whenever you want.'
            : 'Forge your next PR.'}
        </p>

        <button
          className={`hero-workout hero-workout-button ${active ? 'locked' : ''}`}
          onClick={() => !active && setShowSelector(true)}
          disabled={Boolean(active)}
        >
          <span>Today</span>
          <strong>{workoutName}</strong>
          {!active && <ChevronDown size={18} />}
        </button>

        <button className="gold-button machined" onClick={onStart}>
          <Dumbbell size={18} />
          {active ? 'Resume Workout' : 'Start Workout'}
          <ArrowRight size={17} />
        </button>
      </section>

      <section className={`recovery-intelligence-card ${recovery.tone}`}>
        <div className="recovery-score-ring">
          <HeartPulse size={19} />
          <strong>{recovery.score}</strong>
        </div>
        <div>
          <span className="eyebrow">RECOVERY INTELLIGENCE</span>
          <h2>{recovery.status}</h2>
          <p>{recovery.insight}</p>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard label="Workouts" value={state.history.length} />
        <MetricCard label="Sets" value={totalSets(state.history).toLocaleString()} />
        <MetricCard label="Volume" value={totalVolume(state.history).toLocaleString()} />
        <MetricCard label="Achievements" value={state.achievements.length} />
      </section>

      <section className="menu-card luxury-surface">
        <button onClick={() => setScreen('gym')}><Dumbbell /> Gym Mode <ArrowRight /></button>
        <button onClick={() => setScreen('progress')}><Flame /> My Training <ArrowRight /></button>
        <button onClick={() => setScreen('builder')}><Layers3 /> Workout Builder <ArrowRight /></button>
        <button onClick={() => setScreen('progress')}><Trophy /> Achievements <ArrowRight /></button>
      </section>

      {showSelector && !active && (
        <WorkoutSelector
          workouts={state.program.rotation}
          selectedWorkout={workoutName}
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
    </>
  )
}
