import { ArrowRight, Dumbbell, Flame, Layers3, Trophy } from 'lucide-react'
import MetricCard from '../components/MetricCard'
import { totalSets, totalVolume } from '../lib/metrics'

export default function HomeScreen({ state, onStart, setScreen }) {
  const active = state.activeWorkout
  const workoutName = active ? active.name : state.program.nextWorkout

  return (
    <>
      <section className="hero-card luxury-surface">
        <div className="hero-noise" />
        <div className="hero-orbit one" />
        <div className="hero-orbit two" />

        <span className="eyebrow">{active ? 'WORKOUT IN PROGRESS' : workoutName}</span>
        <h1>{active ? 'Continue.' : 'Ready.'}</h1>
        <p>{active ? 'Return to the set that matters.' : 'Forge your next PR.'}</p>

        <div className="hero-workout">
          <span>Today</span>
          <strong>{workoutName}</strong>
        </div>

        <button className="gold-button machined" onClick={onStart}>
          <Dumbbell size={18} />
          {active ? 'Resume Workout' : 'Start Workout'}
          <ArrowRight size={17} />
        </button>
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
    </>
  )
}
