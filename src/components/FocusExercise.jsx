import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import {
  formatCompletedSetDisplay,
  formatLegacyCompletedSetDisplay,
  isActiveSetEntered,
  isComparableForLoadPr,
  LOAD_TYPE_OPTIONS,
  loadTypeLabel,
  loadTypeRequiresWeightInput,
  normalizeLoadType,
  externalLoadAmount,
} from '../lib/exerciseLoad'
import {
  formatPrescriptionDisplay,
  gymModeSetLabel,
} from '../lib/exercisePrescription'
import Stepper from './Stepper'

const SET_TYPES = [
  'Warm-up',
  'Working',
  'Top Set',
  'Back-off',
  'Drop Set',
  'Failure',
  'AMRAP',
  'Superset',
]

const ACCENTS = {
  Chest: '#6f2f36',
  Back: '#4d6478',
  Shoulders: '#665775',
  Traps: '#6a6258',
  Biceps: '#9b653f',
  Triceps: '#8b5a3b',
  'Rear Delts': '#6d5877',
  Quads: '#456b4e',
  Hamstrings: '#4f6852',
  Calves: '#5d6b62',
  Core: '#8a8f91',
  'Lower Back': '#5b6670',
  Glutes: '#596f58',
  Forearms: '#7a684d',
  Other: '#6c6a65',
}

const muscleAccent = (muscle) =>
  ACCENTS[muscle] || ACCENTS.Other

const estimatedOneRepMax = (weight, reps) => {
  const numericWeight = Number(weight || 0)
  const numericReps = Number(reps || 0)

  if (!numericWeight || !numericReps) return 0
  if (numericReps === 1) return numericWeight

  return numericWeight * (1 + numericReps / 30)
}

export default function FocusExercise({
  exercise,
  exerciseIndex,
  totalExercises,
  previousSets,
  onSetChange,
  onAddSet,
  onPrevious,
  onNext,
  onRepeatSet,
  onSkipExercise,
  onQuickAdd,
  onRemoveSet,
  onUndoSkip,
  onSetCompleted,
  onLoadTypeChange,
  navigationDirection,
  executionRole = 'standard',
}) {
  const [showPrevious, setShowPrevious] =
    useState(false)

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

  const activeSetIndex = Math.max(
    0,
    exercise.sets.findIndex(
      (set) => !set.done,
    ),
  )

  const lastSessionBest = previousSets.length
    ? previousSets.reduce((best, set) => {
        const bestLoad = externalLoadAmount(best, loadType)
        const setLoad = externalLoadAmount(set, loadType)
        if (setLoad > bestLoad) return set
        if (setLoad === bestLoad && Number(set.reps) > Number(best?.reps || 0)) {
          return set
        }
        return best
      }, previousSets[0])
    : null

  const previousBestWeight = Math.max(
    0,
    ...previousSets.map((set) => externalLoadAmount(set, loadType)),
  )

  const previousBestEstimatedMax = Math.max(
    0,
    ...previousSets.map((set) =>
      estimatedOneRepMax(
        set.weight,
        set.reps,
      ),
    ),
  )

  const entered = exercise.sets.filter((set) =>
    isActiveSetEntered(set, loadType),
  )

  const complete =
    entered.length > 0 &&
    entered.every((set) => set.done)

  const prescriptionLabel = exercise.prescription
    ? formatPrescriptionDisplay(exercise.prescription)
    : null

  return (
    <article
      className={`focus-exercise ${
        complete ? 'complete' : ''
      } direction-${
        navigationDirection || 'next'
      }`}
      style={{
        '--muscle-accent':
          muscleAccent(exercise.muscle),
      }}
    >
      <header className="focus-exercise-header">
        <div className="focus-index">
          {String(exerciseIndex + 1).padStart(
            2,
            '0',
          )}
          <span>
            /{' '}
            {String(totalExercises).padStart(
              2,
              '0',
            )}
          </span>
        </div>

        <span className="muscle-pill">
          {exercise.muscle}
        </span>

        <h1>{exercise.name}</h1>

        {prescriptionLabel ? (
          <p className="focus-prescription-label">{prescriptionLabel}</p>
        ) : null}

        <label className="focus-load-type">
          <span>Load type</span>
          <select
            value={loadType}
            aria-label="Load type"
            onChange={(event) =>
              onLoadTypeChange?.(event.target.value)
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

        {executionRole === 'priority' ? (
          <span className="execution-role-badge execution-role-badge--priority">
            Priority
          </span>
        ) : null}
        {executionRole === 'accessory' ? (
          <span className="execution-role-badge execution-role-badge--accessory">
            If time allows
          </span>
        ) : null}

        <button
          className={`previous-session-toggle lift-reference ${
            showPrevious ? 'open' : ''
          }`}
          onClick={() =>
            setShowPrevious(
              (value) => !value,
            )
          }
        >
          <span>
            <small>LAST SESSION</small>
            <strong>
              {lastSessionBest
                ? formatLegacyCompletedSetDisplay(lastSessionBest)
                : 'No previous workout'}
            </strong>
          </span>

          <ChevronDown size={18} />
        </button>

        {showPrevious && (
          <div className="previous-session-panel">
            {previousSets.length ? (
              previousSets.map(
                (set, index) => (
                  <div
                    key={`${set.weight}-${set.reps}-${index}`}
                  >
                    <span>
                      {set.type ||
                        `Set ${index + 1}`}
                    </span>
                    <strong>
                      {formatLegacyCompletedSetDisplay(set)}
                    </strong>
                  </div>
                ),
              )
            ) : (
              <p>
                Your first session with this
                exercise will become the
                reference.
              </p>
            )}
          </div>
        )}
      </header>

      <div className="focus-set-list">
        {exercise.sets.map(
          (set, setIndex) => {
            const currentEstimatedMax =
              estimatedOneRepMax(
                set.weight,
                set.reps,
              )

            const potentialWeightPr =
              isComparableForLoadPr({ loadType }) &&
              externalLoadAmount({ ...set, loadType }, loadType) >
                previousBestWeight

            const potentialStrengthPr =
              isComparableForLoadPr({ loadType }) &&
              previousBestEstimatedMax > 0 &&
              currentEstimatedMax >
                previousBestEstimatedMax

            const potentialPr =
              previousSets.length > 0 &&
              isActiveSetEntered(set, loadType) &&
              (potentialWeightPr || potentialStrengthPr)

            return (
              <section
                className={`focus-set-card ${
                  set.done
                    ? 'done collapsed'
                    : ''
                } ${
                  !set.done &&
                  setIndex ===
                    activeSetIndex
                    ? 'current'
                    : ''
                } ${
                  !set.done &&
                  setIndex >
                    activeSetIndex
                    ? 'upcoming'
                    : ''
                }`}
                key={set.id}
              >
                <div className="focus-set-topline">
                  <span>
                    {set.done
                      ? '✓'
                      : 'SET'}{' '}
                    {String(
                      setIndex + 1,
                    ).padStart(2, '0')}
                  </span>

                  <select
                    value={set.type}
                    onChange={(event) =>
                      onSetChange(
                        setIndex,
                        'type',
                        event.target.value,
                      )
                    }
                  >
                    {SET_TYPES.map(
                      (type) => (
                        <option key={type}>
                          {type}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="set-utility-row">
                  {setIndex > 0 && (
                    <button
                      className="repeat-last-set"
                      onClick={() =>
                        onRepeatSet(setIndex)
                      }
                    >
                      Repeat previous set
                    </button>
                  )}

                  {exercise.sets.length >
                    1 && (
                    <button
                      className="remove-set-button"
                      onClick={() =>
                        onRemoveSet(
                          setIndex,
                        )
                      }
                      aria-label={`Remove set ${
                        setIndex + 1
                      }`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {!set.done &&
                  setIndex ===
                    activeSetIndex && (
                    <div className="lift-current-label">
                      {gymModeSetLabel(
                        setIndex,
                        exercise.prescription ?? { sets: exercise.sets.length },
                      )}
                    </div>
                  )}

                {potentialPr &&
                  !set.done && (
                    <div className="lift-pr-preview">
                      <Trophy size={14} />
                      <span>
                        {potentialWeightPr
                          ? 'Potential weight PR'
                          : 'Potential strength PR'}
                      </span>
                    </div>
                  )}

                <div className="focus-control-grid">
                  {showWeightInput ? (
                    <div className="focus-control">
                      <label>{weightFieldLabel}</label>

                      <Stepper
                        value={set.weight}
                        step={5}
                        inputMode="decimal"
                        onChange={(value) =>
                          onSetChange(
                            setIndex,
                            'weight',
                            value,
                          )
                        }
                      />

                      <div className="quick-adjust">
                        <button
                          onClick={() =>
                            onSetChange(
                              setIndex,
                              'weight',
                              Math.max(
                                0,
                                Number(
                                  set.weight ||
                                    0,
                                ) - 10,
                              ),
                            )
                          }
                        >
                          −10
                        </button>

                        <button
                          onClick={() =>
                            onSetChange(
                              setIndex,
                              'weight',
                              Number(
                                set.weight ||
                                  0,
                              ) + 10,
                            )
                          }
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="focus-control">
                    <label>Reps</label>

                    <Stepper
                      value={set.reps}
                      step={1}
                      onChange={(value) =>
                        onSetChange(
                          setIndex,
                          'reps',
                          value,
                        )
                      }
                    />

                    <div className="quick-adjust">
                      <button
                        onClick={() =>
                          onSetChange(
                            setIndex,
                            'reps',
                            Math.max(
                              0,
                              Number(
                                set.reps ||
                                  0,
                              ) - 2,
                            ),
                          )
                        }
                      >
                        −2
                      </button>

                      <button
                        onClick={() =>
                          onSetChange(
                            setIndex,
                            'reps',
                            Number(
                              set.reps ||
                                0,
                            ) + 2,
                          )
                        }
                      >
                        +2
                      </button>
                    </div>
                  </div>
                </div>

                <label className="focus-done-button">
                  <input
                    type="checkbox"
                    checked={set.done}
                    onChange={(event) => {
                      const checked =
                        event.target.checked

                      onSetChange(
                        setIndex,
                        'done',
                        checked,
                      )

                      if (checked) {
                        onSetCompleted?.({
                          exercise,
                          set,
                          setIndex,
                          potentialPr,
                        })
                      }
                    }}
                  />

                  <span>
                    <Check size={19} />
                    {set.done
                      ? formatCompletedSetDisplay({
                          ...set,
                          loadType,
                        })
                      : 'Complete set'}
                  </span>
                </label>
              </section>
            )
          },
        )}
      </div>

      <div className="focus-utility-grid">
        <button
          className="focus-add-set"
          onClick={onAddSet}
        >
          <Plus size={18} />
          Add set
        </button>

        <button
          className="focus-add-set"
          onClick={onQuickAdd}
        >
          <Plus size={18} />
          Add exercise
        </button>
      </div>

      {exercise.skipped ? (
        <button
          className="undo-skip-button"
          onClick={onUndoSkip}
        >
          <RotateCcw size={16} />
          Undo skip
        </button>
      ) : (
        <button
          className="skip-exercise-button"
          onClick={onSkipExercise}
        >
          Skip this exercise today
        </button>
      )}

      <footer className="exercise-pager">
        <button
          className="previous-exercise-button"
          disabled={exerciseIndex === 0}
          onClick={onPrevious}
        >
          <ChevronLeft size={19} />
          Previous
        </button>

        <button
          className="next-exercise-button"
          disabled={
            exerciseIndex ===
            totalExercises - 1
          }
          onClick={onNext}
        >
          <span>
            <small>
              {complete
                ? 'EXERCISE COMPLETE'
                : 'MOVE ON WHEN READY'}
            </small>
            <strong>
              Next Exercise
            </strong>
          </span>

          <ChevronRight size={19} />
        </button>
      </footer>
    </article>
  )
}
