import { useEffect, useMemo, useState } from 'react'
import { Trophy, HeartPulse, ArrowRight, Check, Pencil, Target, X } from 'lucide-react'
import { MILESTONE_CHAINS } from '../data/defaultProgram'
import StrengthChart from '../components/StrengthChart'
import ExerciseProfile from '../components/ExerciseProfile'
import TrainingOverview from '../components/TrainingOverview'
import { SessionDetail } from './HistoryScreen'
import {
  consistencyStreak,
  exerciseNames,
  exerciseSessions,
  personalBest,
  prsThisMonth,
  recentPRs,
  totalVolume,
} from '../lib/metrics'
import { athleteGoalBackend } from '../lib/athleteGoals'
import AthleteGoalPanel from '../components/AthleteGoalPanel'

const METRICS = [
  { id: 'e1rm', label: 'Current estimate' },
  { id: 'heaviest', label: 'Heaviest Set' },
  { id: 'volume', label: 'Session Volume' },
]

export default function ProgressScreen({
  state,
  athleteId = null,
  liftGoals = {},
  onLiftGoalChange,
  onOpenReadinessTrends,
  onDeleteSession,
  onUpdateSession,
}) {
  const exercises = useMemo(() => {
    const fromHistory = exerciseNames(state.history)
    const fromProgram = Object.values(state.program.workouts)
      .flat()
      .map((exercise) => exercise.name)
    return [...new Set([...fromHistory, ...fromProgram])]
  }, [state.history, state.program])

  const [selectedExercise, setSelectedExercise] = useState('')
  const [metric, setMetric] = useState('e1rm')
  const [selectedSession, setSelectedSession] = useState(null)
  const [structuredGoal, setStructuredGoal] = useState(null)
  const [goalLoading, setGoalLoading] = useState(Boolean(athleteId))
  const [editingLiftGoal, setEditingLiftGoal] = useState(false)
  const [liftGoalDraft, setLiftGoalDraft] = useState({
    target: '',
    targetDate: '',
  })

  useEffect(() => {
    let active = true

    if (!athleteId) {
      setStructuredGoal(null)
      setGoalLoading(false)
      return undefined
    }

    setGoalLoading(true)
    athleteGoalBackend
      .getAthleteGoal(athleteId)
      .then((goal) => {
        if (active) setStructuredGoal(goal)
      })
      .catch((error) => {
        console.error('Could not load structured athlete goal:', error)
        if (active) setStructuredGoal(null)
      })
      .finally(() => {
        if (active) setGoalLoading(false)
      })

    return () => {
      active = false
    }
  }, [athleteId])

  const sessions = exerciseSessions(state.history, selectedExercise)
  const prs = recentPRs(state.history, 8)
  const streak = consistencyStreak(state.history)
  const monthlyPrs = prsThisMonth(state.history)
  const lifetimeVolume = Math.round(totalVolume(state.history))
  const currentBest = selectedExercise
    ? personalBest(state.history, selectedExercise)
    : 0
  const selectedLiftGoal = selectedExercise
    ? liftGoals?.[selectedExercise] ?? null
    : null
  const liftGoalTarget = Number(selectedLiftGoal?.target || 0)
  const liftGoalProgress =
    liftGoalTarget > 0 && currentBest > 0
      ? Math.min(100, Math.round((currentBest / liftGoalTarget) * 100))
      : 0

  useEffect(() => {
    setEditingLiftGoal(false)
    setLiftGoalDraft({
      target:
        selectedLiftGoal?.target == null ? '' : String(selectedLiftGoal.target),
      targetDate: selectedLiftGoal?.targetDate ?? '',
    })
  }, [selectedExercise, selectedLiftGoal?.target, selectedLiftGoal?.targetDate])

  const saveLiftGoal = () => {
    if (!selectedExercise) return
    const target = Number(liftGoalDraft.target)
    if (!Number.isFinite(target) || target <= 0) return

    onLiftGoalChange?.(selectedExercise, {
      target,
      unit: 'lb',
      targetDate: liftGoalDraft.targetDate || '',
      updatedAt: new Date().toISOString(),
    })
    setEditingLiftGoal(false)
  }

  const clearLiftGoal = () => {
    if (!selectedExercise) return
    onLiftGoalChange?.(selectedExercise, null)
    setLiftGoalDraft({ target: '', targetDate: '' })
    setEditingLiftGoal(false)
  }

  if (selectedSession) {
    const current =
      state.history.find((session) => session.id === selectedSession.id) ??
      selectedSession

    return (
      <SessionDetail
        session={current}
        history={state.history}
        onClose={() => setSelectedSession(null)}
        onDelete={(sessionId) => {
          onDeleteSession?.(sessionId)
          setSelectedSession(null)
        }}
        onUpdate={onUpdateSession}
      />
    )
  }

  return (
    <>
      <section className="progress-overall-hero">
        <div>
          <span className="eyebrow">OVERALL PROGRESS</span>
          <h1>Your training is moving.</h1>
          <p>Start with the big picture. Open a lift only when you want the detailed strength trend, history, or a target for that exercise.</p>
        </div>
        <div className="progress-overall-stats">
          <article><small>Workouts logged</small><strong>{state.history.length}</strong></article>
          <article><small>Current streak</small><strong>{streak}<span> days</span></strong></article>
          <article><small>PRs this month</small><strong>{monthlyPrs}</strong></article>
          <article><small>Lifetime volume</small><strong>{lifetimeVolume.toLocaleString()}<span> lb</span></strong></article>
        </div>
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

      <section className="progress-lift-browser">
        <header>
          <div>
            <span className="eyebrow">LIFT PROGRESS</span>
            <h2>Choose an exercise</h2>
            <p>Open one lift for its chart, best sets, history, and goal.</p>
          </div>
        </header>

        <label className="progress-lift-select">
          <span>Exercise</span>
          <select
            value={selectedExercise}
            onChange={(event) => {
              setSelectedExercise(event.target.value)
              setMetric('e1rm')
            }}
          >
            <option value="">Select an exercise</option>
            {exercises.map((exercise) => (
              <option key={exercise} value={exercise}>{exercise}</option>
            ))}
          </select>
        </label>

        {!selectedExercise ? (
          <div className="progress-lift-empty">
            <Target size={22} />
            <div>
              <strong>Your lift details stay out of the way until you need them.</strong>
              <span>Select an exercise above to inspect strength progress or set a target for that lift.</span>
            </div>
          </div>
        ) : (
          <div className="progress-selected-lift">
            <section className="progress-selected-lift-header">
              <div>
                <span className="eyebrow">SELECTED LIFT</span>
                <h2>{selectedExercise}</h2>
                <small>{sessions.length ? `${sessions.length} logged session${sessions.length === 1 ? '' : 's'}` : 'Your first logged session will establish the trend'}</small>
              </div>
              <div className="progress-selected-best">
                <span>Current best</span>
                <strong>{currentBest > 0 ? `${currentBest} lb` : '—'}</strong>
              </div>
            </section>

            <section className="progress-lift-goal-card">
              <div className="progress-lift-goal-heading">
                <div>
                  <span className="eyebrow">LIFT GOAL</span>
                  <strong>{selectedLiftGoal ? `${selectedLiftGoal.target} lb target` : `Set a ${selectedExercise} target`}</strong>
                  <small>{selectedLiftGoal?.targetDate ? `Target date · ${new Date(`${selectedLiftGoal.targetDate}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Optional · specific to this exercise'}</small>
                </div>
                {!editingLiftGoal ? (
                  <button type="button" className="progress-lift-goal-edit" onClick={() => setEditingLiftGoal(true)}>
                    <Pencil size={14}/>{selectedLiftGoal ? 'Edit' : 'Set goal'}
                  </button>
                ) : null}
              </div>

              {selectedLiftGoal && !editingLiftGoal ? (
                <div className="progress-lift-goal-progress">
                  <div>
                    <span>Progress to target</span>
                    <strong>{currentBest > 0 ? `${currentBest} / ${selectedLiftGoal.target} lb` : `Target ${selectedLiftGoal.target} lb`}</strong>
                  </div>
                  <div className="progress-lift-goal-track"><i style={{ width: `${liftGoalProgress}%` }}/></div>
                </div>
              ) : null}

              {editingLiftGoal ? (
                <div className="progress-lift-goal-form">
                  <label>
                    <span>Target weight</span>
                    <div>
                      <input type="number" min="1" step="5" inputMode="decimal" value={liftGoalDraft.target} onChange={(event) => setLiftGoalDraft((current) => ({ ...current, target: event.target.value }))} placeholder={currentBest > 0 ? String(currentBest + 10) : '225'}/>
                      <strong>lb</strong>
                    </div>
                  </label>
                  <label>
                    <span>Target date (optional)</span>
                    <input type="date" value={liftGoalDraft.targetDate} onChange={(event) => setLiftGoalDraft((current) => ({ ...current, targetDate: event.target.value }))}/>
                  </label>
                  <div className="progress-lift-goal-actions">
                    <button type="button" className="ui-btn-tertiary" onClick={() => {
                      setLiftGoalDraft({ target: selectedLiftGoal?.target == null ? '' : String(selectedLiftGoal.target), targetDate: selectedLiftGoal?.targetDate ?? '' })
                      setEditingLiftGoal(false)
                    }}><X size={14}/>Cancel</button>
                    {selectedLiftGoal ? <button type="button" className="ui-btn-tertiary progress-lift-goal-clear" onClick={clearLiftGoal}>Clear</button> : null}
                    <button type="button" className="gold-button machined" disabled={!Number.isFinite(Number(liftGoalDraft.target)) || Number(liftGoalDraft.target) <= 0} onClick={saveLiftGoal}><Check size={14}/>Save goal</button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="progress-chart-panel progress-chart-panel--primary">
              <header><div><span className="eyebrow">STRENGTH TREND</span><h2>{selectedExercise}</h2></div></header>
              <div className="metric-switcher">
                {METRICS.map((item) => (
                  <button key={item.id} className={metric === item.id ? 'active' : ''} onClick={() => setMetric(item.id)}>{item.label}</button>
                ))}
              </div>
              <StrengthChart sessions={sessions} metric={metric} />
            </section>

            <details className="foundry-disclosure progress-details-panel">
              <summary><span>Exercise profile</span><small>{selectedExercise} · sessions, bests, and history</small></summary>
              <ExerciseProfile history={state.history} exercise={selectedExercise} onOpenSession={setSelectedSession}/>
            </details>
          </div>
        )}
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

      {!goalLoading ? (
        <details className="foundry-disclosure progress-details-panel progress-training-goal">
          <summary>
            <span>Training goal & priorities</span>
            <small>{structuredGoal ? 'Your broader training direction' : 'Optional overall goal'}</small>
          </summary>
          <AthleteGoalPanel athleteId={athleteId} goal={structuredGoal} onGoalChange={setStructuredGoal}/>
        </details>
      ) : null}
    </>
  )
}
