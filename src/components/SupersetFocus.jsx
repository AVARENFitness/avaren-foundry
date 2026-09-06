import { Check, ChevronLeft, ChevronRight, Plus, Trophy } from 'lucide-react'
import {
  formatCompletedSetDisplay,
  isActiveSetEntered,
  LOAD_TYPE_OPTIONS,
  loadTypeLabel,
  loadTypeRequiresWeightInput,
  normalizeLoadType,
} from '../lib/exerciseLoad'
import {
  formatPrescriptionDisplay,
  gymModeSetLabel,
} from '../lib/exercisePrescription'
import {
  buildExerciseHistoryGlance,
} from '../lib/exercisePreviousContext'
import ExerciseHistoryGlance from './ExerciseHistoryGlance'
import Stepper from './Stepper'

export default function SupersetFocus({
  exercises,
  group,
  round,
  totalRounds,
  history = [],
  onSetChange,
  onLoadTypeChange,
  onPreviousRound,
  onNextRound,
  onAddRound,
  onPreviousExercise,
  onNextExercise,
  canGoPreviousExercise = false,
  canGoNextExercise = false,
  nextExerciseLabel = 'Next Exercise',
  supersetComplete = false,
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
        {exercises.map((exercise) => {
          const set = exercise.sets[round]
          if (!set) return null

          const loadType = normalizeLoadType(
            exercise.loadType,
            exercise.name,
          )
          const showWeightInput = loadTypeRequiresWeightInput(loadType)
          const weightFieldLabel =
            loadType === 'assisted'
              ? 'Assistance'
              : loadType === 'bodyweight_added'
                ? 'Added weight'
                : 'Weight'

          const previousGlance = buildExerciseHistoryGlance(
            history,
            exercise,
            loadType,
          )
          const {
            potentialPrForSet,
            previousDisplay,
            bestDisplay,
            hasHistory,
            emptyLabel,
          } = previousGlance
          const earlierSets = exercise.sets
            .slice(0, round)
            .filter((item) => item.done)
            .map((item) => ({
              ...item,
              exercise: exercise.name,
              loadType,
            }))
          const {
            potentialWeightPr,
            potentialRepPr,
            potentialPr,
            isPr,
          } = potentialPrForSet(
            { ...set, exercise: exercise.name, loadType },
            { earlierSets },
          )

          return (
            <section
              className={`superset-exercise-card ${set.done ? 'done' : ''}`}
              key={exercise.id}
              data-testid={`superset-exercise-${exercise.id}`}
            >
              <div className="superset-exercise-title">
                <div>
                  <span>{exercise.muscle}</span>
                  <h2>{exercise.name}</h2>
                  {exercise.prescription ? (
                    <p className="focus-prescription-label">
                      {formatPrescriptionDisplay(exercise.prescription)}
                    </p>
                  ) : null}
                </div>
                <strong>{set.type}</strong>
              </div>

              <ExerciseHistoryGlance
                previousDisplay={previousDisplay}
                bestDisplay={bestDisplay}
                hasHistory={hasHistory}
                emptyLabel={emptyLabel}
                aria-label={`History for ${exercise.name}`}
              />

              <label className="focus-load-type">
                <span>Load type</span>
                <select
                  value={loadType}
                  aria-label={`Load type for ${exercise.name}`}
                  onChange={(event) =>
                    onLoadTypeChange?.(exercise.id, event.target.value)
                  }
                >
                  {LOAD_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {!showWeightInput ? (
                <p className="focus-load-type-hint">{loadTypeLabel(loadType)}</p>
              ) : null}

              <div className="lift-current-label">
                {gymModeSetLabel(
                  round,
                  exercise.prescription ?? { sets: exercise.sets.length },
                )}
              </div>

              {potentialPr && !set.done ? (
                <div
                  className="lift-pr-preview"
                  data-testid={`pr-preview-${exercise.id}`}
                >
                  <Trophy size={14} />
                  <span>
                    {potentialWeightPr
                      ? 'Potential weight PR'
                      : potentialRepPr
                        ? 'Potential rep PR'
                        : 'Potential PR'}
                  </span>
                </div>
              ) : null}

              {set.done && isPr ? (
                <div className="lift-pr-badge" data-testid={`set-pr-${exercise.id}`}>
                  <Trophy size={12} />
                  PR
                </div>
              ) : null}

              <div className="focus-control-grid">
                {showWeightInput ? (
                  <div className="focus-control">
                    <label>{weightFieldLabel}</label>
                    <Stepper
                      value={set.weight}
                      step={5}
                      inputMode="decimal"
                      onChange={(value) =>
                        onSetChange(exercise.id, round, 'weight', value)
                      }
                    />
                  </div>
                ) : null}

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
                  {set.done
                    ? formatCompletedSetDisplay({ ...set, loadType })
                    : isActiveSetEntered(set, loadType)
                      ? 'Complete set'
                      : 'Complete set'}
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

      <footer className="exercise-pager superset-exercise-pager">
        <button
          className="previous-exercise-button"
          disabled={!canGoPreviousExercise}
          onClick={onPreviousExercise}
        >
          <ChevronLeft size={19} />
          Previous
        </button>

        <button
          className={`next-exercise-button ${supersetComplete && canGoNextExercise ? 'ready' : ''}`}
          disabled={!canGoNextExercise}
          onClick={onNextExercise}
        >
          <span>
            <small>
              {supersetComplete
                ? 'SUPERSET COMPLETE'
                : 'FINISH ALL ROUNDS FIRST'}
            </small>
            <strong>{nextExerciseLabel}</strong>
          </span>

          <ChevronRight size={19} />
        </button>
      </footer>
    </article>
  )
}
