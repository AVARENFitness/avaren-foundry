import { useMemo, useState } from 'react'
import { Award, Flame, Layers3, Trophy, HeartPulse, ArrowRight } from 'lucide-react'
import { BASELINES, MILESTONE_CHAINS } from '../data/defaultProgram'
import StrengthChart from '../components/StrengthChart'
import ExerciseProfile from '../components/ExerciseProfile'
import TrainingOverview from '../components/TrainingOverview'
import {
  consistencyStreak,
  exerciseNames,
  exerciseSessions,
  personalBest,
  prsThisMonth,
  recentPRs,
  totalSets,
  totalVolume,
} from '../lib/metrics'

const METRICS = [
  { id: 'e1rm', label: 'Estimated 1RM' },
  { id: 'heaviest', label: 'Heaviest Set' },
  { id: 'volume', label: 'Session Volume' },
]

export default function ProgressScreen({
  state,
  onOpenReadinessTrends,
}) {
  const exercises = useMemo(() => {
    const fromHistory = exerciseNames(state.history)
    const fromProgram = Object.values(state.program.workouts)
      .flat()
      .map((exercise) => exercise.name)
    return [...new Set([...fromHistory, ...fromProgram])]
  }, [state.history, state.program])

  const [selectedExercise, setSelectedExercise] = useState(
    exercises.includes('Bench Press') ? 'Bench Press' : exercises[0],
  )
  const [metric, setMetric] = useState('e1rm')

  const sessions = exerciseSessions(state.history, selectedExercise)
  const prs = recentPRs(state.history, 8)

  return (
    <>
      <TrainingOverview state={state} />
      <section className="section-heading progress-heading">
        <span className="eyebrow">MY TRAINING</span>
        <h1>Progress, without noise.</h1>
        <p>Open the details when you want them. Gym Mode stays focused.</p>
      </section>

      <button
        className="progress-readiness-entry"
        onClick={onOpenReadinessTrends}
      >
        <div className="progress-readiness-icon">
          <HeartPulse size={21} />
        </div>
        <div>
          <span className="eyebrow">READINESS ANALYTICS</span>
          <strong>Review your recovery patterns.</strong>
          <small>
            Compare sleep, energy, soreness, stress, workouts,
            and PR performance.
          </small>
        </div>
        <ArrowRight size={18} />
      </button>

      <section className="progress-overview-grid">
        <article><Trophy /><span>Workouts</span><strong>{state.history.length}</strong></article>
        <article><Flame /><span>Streak</span><strong>{consistencyStreak(state.history)}</strong></article>
        <article><Layers3 /><span>Lifetime Sets</span><strong>{totalSets(state.history).toLocaleString()}</strong></article>
        <article><Award /><span>PRs This Month</span><strong>{prsThisMonth(state.history)}</strong></article>
      </section>

      <section className="progress-chart-panel">
        <header>
          <div>
            <span className="eyebrow">STRENGTH GRAPH</span>
            <h2>{selectedExercise}</h2>
          </div>
          <select
            value={selectedExercise}
            onChange={(event) => setSelectedExercise(event.target.value)}
          >
            {exercises.map((exercise) => (
              <option key={exercise}>{exercise}</option>
            ))}
          </select>
        </header>

        <div className="metric-switcher">
          {METRICS.map((item) => (
            <button
              key={item.id}
              className={metric === item.id ? 'active' : ''}
              onClick={() => setMetric(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <StrengthChart sessions={sessions} metric={metric} />

        <div className="chart-total">
          <span>Lifetime training volume</span>
          <strong>{Math.round(totalVolume(state.history)).toLocaleString()} lb</strong>
        </div>
      </section>

      <section className="milestone-panel">
        <div className="panel-title">
          <span className="eyebrow">DYNAMIC ACHIEVEMENTS</span>
          <h2>Next milestones</h2>
        </div>

        {Object.entries(MILESTONE_CHAINS).map(([exercise, chain]) => {
          const best = Math.max(
            BASELINES[exercise],
            personalBest(state.history, exercise),
          )
          const next = chain.find((target) => target > best)
          const previousTargets = [BASELINES[exercise], ...chain].filter(
            (target) => target <= best,
          )
          const start = previousTargets.at(-1) ?? BASELINES[exercise]
          const progress = next
            ? Math.max(0, Math.min(100, ((best - start) / (next - start || 1)) * 100))
            : 100

          return (
            <article className="milestone-card" key={exercise}>
              <div>
                <strong>{exercise}</strong>
                <span>Current best · {best} lb</span>
              </div>
              <div className="milestone-number">
                <small>{next ? 'NEXT' : 'COMPLETE'}</small>
                <strong>{next ? `${next} lb` : '✓'}</strong>
              </div>
              <div className="milestone-progress">
                <div style={{ width: `${progress}%` }} />
              </div>
            </article>
          )
        })}
      </section>

      <section className="pr-feed-panel">
        <div className="panel-title">
          <span className="eyebrow">RECENT PRS</span>
          <h2>Quiet wins.</h2>
        </div>

        {!prs.length && (
          <p className="progress-empty-copy">
            Your first completed workouts will begin the PR timeline.
          </p>
        )}

        {prs.map((pr) => (
          <article className="pr-feed-row" key={pr.id}>
            <div className="pr-medallion"><Trophy size={16} /></div>
            <div>
              <strong>{pr.exercise}</strong>
              <span>{pr.type} · {pr.date}</span>
            </div>
            <strong>{pr.value}</strong>
          </article>
        ))}
      </section>

      {selectedExercise && (
        <ExerciseProfile history={state.history} exercise={selectedExercise} />
      )}
    </>
  )
}
