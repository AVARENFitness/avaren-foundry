import { useMemo, useState } from 'react'
import { Award, Flame, Layers3, Trophy, HeartPulse, ArrowRight } from 'lucide-react'
import { MILESTONE_CHAINS } from '../data/defaultProgram'
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
  const streak = consistencyStreak(state.history)
  const monthlyPrs = prsThisMonth(state.history)
  const lifetimeVolume = Math.round(totalVolume(state.history))

  return (
    <>
      <section className="progress-summary-hero">
        <span className="eyebrow">YOUR PROGRESS</span>
        <h1>{state.history.length} workouts logged</h1>
        <p>
          {streak} day streak · {monthlyPrs} PRs this month · {lifetimeVolume.toLocaleString()} lb lifetime volume
        </p>
      </section>

      <button
        className="progress-readiness-entry progress-readiness-entry--quiet"
        onClick={onOpenReadinessTrends}
      >
        <div className="progress-readiness-icon">
          <HeartPulse size={21} />
        </div>
        <div>
          <span className="eyebrow">READINESS</span>
          <strong>Review recovery patterns</strong>
          <small>Sleep, energy, soreness, stress, and workout load</small>
        </div>
        <ArrowRight size={18} />
      </button>

      <section className="progress-chart-panel progress-chart-panel--primary">
        <header>
          <div>
            <span className="eyebrow">STRENGTH</span>
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
          <strong>{lifetimeVolume.toLocaleString()} lb</strong>
        </div>
      </section>

      <details className="foundry-disclosure progress-details-panel">
        <summary>
          <span>Detailed metrics</span>
          <small>Lifetime volume, streaks, muscle breakdown</small>
        </summary>
        <TrainingOverview state={state} compact />
      </details>

      <details className="foundry-disclosure progress-details-panel">
        <summary>
          <span>Next milestones</span>
          <small>Dynamic achievement targets by lift</small>
        </summary>

        <section className="milestone-panel milestone-panel--nested">
          {Object.entries(MILESTONE_CHAINS).map(([exercise, chain]) => {
            const best = personalBest(state.history, exercise)
            const hasPersonalBest = best > 0
            const next = hasPersonalBest
              ? chain.find((target) => target > best)
              : null
            const previousTargets = chain.filter((target) => target <= best)
            const start = previousTargets.at(-1) ?? 0
            const progress = next
              ? Math.max(0, Math.min(100, ((best - start) / (next - start || 1)) * 100))
              : hasPersonalBest
                ? 100
                : 0

            return (
              <article className="milestone-card" key={exercise}>
                <div>
                  <strong>{exercise}</strong>
                  <span>
                    {hasPersonalBest
                      ? `Current best · ${best} lb`
                      : 'Complete this lift to establish your baseline'}
                  </span>
                </div>
                <div className="milestone-number">
                  <small>
                    {!hasPersonalBest ? 'BASELINE' : next ? 'NEXT' : 'COMPLETE'}
                  </small>
                  <strong>
                    {!hasPersonalBest ? '—' : next ? `${next} lb` : '✓'}
                  </strong>
                </div>
                <div className="milestone-progress">
                  <div style={{ width: `${progress}%` }} />
                </div>
              </article>
            )
          })}
        </section>
      </details>

      <details className="foundry-disclosure progress-details-panel">
        <summary>
          <span>Recent PRs</span>
          <small>{prs.length ? `${prs.length} recent personal records` : 'PR timeline starts after your first workouts'}</small>
        </summary>

        <section className="pr-feed-panel pr-feed-panel--nested">
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
      </details>

      {selectedExercise && (
        <details className="foundry-disclosure progress-details-panel">
          <summary>
            <span>Exercise profile</span>
            <small>{selectedExercise} · session history and bests</small>
          </summary>
          <ExerciseProfile history={state.history} exercise={selectedExercise} />
        </details>
      )}
    </>
  )
}
