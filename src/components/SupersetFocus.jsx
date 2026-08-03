import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Stepper from './Stepper'

export default function SupersetFocus({
  exercises,
  group,
  round,
  totalRounds,
  onSetChange,
  onPreviousRound,
  onNextRound,
  onAddRound,
}) {
  const roundComplete = exercises.every((exercise) => exercise.sets[round]?.done)

  return (
    <article className="superset-focus">
      <header className="superset-header">
        <span className="eyebrow">SUPERSET {group}</span>
        <h1>Round {round + 1} of {totalRounds}</h1>
        <p>Complete both exercises before moving to the next round.</p>
      </header>

      <div className="superset-exercises">
        {exercises.map((exercise, exerciseIndex) => {
          const set = exercise.sets[round]
          if (!set) return null

          return (
            <section className={`superset-exercise-card ${set.done ? 'done' : ''}`} key={exercise.id}>
              <div className="superset-exercise-title">
                <div>
                  <span>{exercise.muscle}</span>
                  <h2>{exercise.name}</h2>
                </div>
                <strong>{set.type}</strong>
              </div>

              <div className="focus-control-grid">
                <div className="focus-control">
                  <label>Weight</label>
                  <Stepper
                    value={set.weight}
                    step={5}
                    inputMode="decimal"
                    onChange={(value) =>
                      onSetChange(exercise.id, round, 'weight', value)
                    }
                  />
                </div>
                <div className="focus-control">
                  <label>Reps</label>
                  <Stepper
                    value={set.reps}
                    step={1}
                    onChange={(value) =>
                      onSetChange(exercise.id, round, 'reps', value)
                    }
                  />
                </div>
              </div>

              <label className="focus-done-button">
                <input
                  type="checkbox"
                  checked={set.done}
                  onChange={(event) =>
                    onSetChange(
                      exercise.id,
                      round,
                      'done',
                      event.target.checked,
                    )
                  }
                />
                <span>
                  <Check size={18} />
                  {set.done ? 'Set complete' : 'Complete set'}
                </span>
              </label>
            </section>
          )
        })}
      </div>

      <footer className="superset-round-pager">
        <button disabled={round === 0} onClick={onPreviousRound}>
          <ChevronLeft size={18} /> Previous Round
        </button>

        {round < totalRounds - 1 ? (
          <button
            className={roundComplete ? 'ready' : ''}
            onClick={onNextRound}
          >
            Next Round <ChevronRight size={18} />
          </button>
        ) : (
          <button onClick={onAddRound}>
            <Plus size={18} /> Add Round
          </button>
        )}
      </footer>
    </article>
  )
}
