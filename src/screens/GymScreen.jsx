import { Clock3, Dumbbell, MoreHorizontal, Pause, Play, RefreshCw, RotateCcw, StickyNote, TimerReset, X, LogOut } from 'lucide-react'
import FocusExercise from '../components/FocusExercise'
import ProgressRing from '../components/ProgressRing'
import QuickAddModal from '../components/QuickAddModal'
import SupersetFocus from '../components/SupersetFocus'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const MUSCLE_LIGHTS = {
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
import { recentExerciseSets } from '../lib/metrics'
import {
  exerciseExecutionRole,
  isExecutionPlanCurrent,
} from '../lib/sessionExecutionPlan'

export default function GymScreen({
  state,
  onStart,
  activeExercise,
  setActiveExercise,
  onSetChange,
  onWorkoutMetaChange,
  onAddSet,
  onFinish,
  onRepeatSet,
  onSkipExercise,
  onQuickAddExercise,
  onRemoveSet,
  onUndoSkip,
  workoutOptions = [],
  onChangeWorkout,
  onRestartWorkout,
  onEndWorkout,
  recommendation,
  isFinishing = false,
}) {
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [supersetRound, setSupersetRound] = useState(0)
  const [navigationDirection, setNavigationDirection] = useState('next')
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false)
  const [showWorkoutMenu, setShowWorkoutMenu] = useState(false)
  const [showSessionNotes, setShowSessionNotes] = useState(
    Boolean(
      state.activeWorkout?.intent ||
      state.activeWorkout?.notes,
    ),
  )
  const [now, setNow] = useState(() => Date.now())
  const [restDuration, setRestDuration] = useState(90)
  const [restRemaining, setRestRemaining] = useState(0)
  const [restRunning, setRestRunning] = useState(false)
  const [restContext, setRestContext] = useState(null)

  const goPrevious = () => {
    setNavigationDirection('previous')
    setActiveExercise(Math.max(0, activeExercise - 1))
  }

  const goNext = () => {
    setNavigationDirection('next')
    setActiveExercise(
      Math.min(workout.exercises.length - 1, activeExercise + 1),
    )
  }
  const workout = state.activeWorkout
  const executionPlan = isExecutionPlanCurrent(state.sessionExecutionPlan)
    ? state.sessionExecutionPlan
    : null
  const currentExerciseRole = exerciseExecutionRole(
    executionPlan,
    workout?.exercises?.[activeExercise]?.name ?? workout?.exercises?.[0]?.name,
  )

  useEffect(() => {
    if (!workout?.startedAt) return

    const timer = window.setInterval(
      () => setNow(Date.now()),
      1000,
    )

    return () => window.clearInterval(timer)
  }, [workout?.startedAt])

  useEffect(() => {
    if (!restRunning || restRemaining <= 0) return

    const timer = window.setInterval(() => {
      setRestRemaining((current) =>
        Math.max(0, current - 1),
      )
    }, 1000)

    return () => window.clearInterval(timer)
  }, [restRunning, restRemaining])

  useEffect(() => {
    if (
      restRemaining !== 0 ||
      !restRunning
    ) {
      return
    }

    setRestRunning(false)

    if (navigator.vibrate) {
      navigator.vibrate([35, 55, 45])
    }
  }, [restRemaining, restRunning])

  if (!workout) {
    return (
      <section className="empty-state">
        <Dumbbell size={34} />
        <h1>No active workout</h1>
        <p>Your next session is {state.program.nextWorkout}.</p>
        <button className="gold-button machined" onClick={onStart}>
          Start Workout
        </button>
      </section>
    )
  }

  const completedExercises = workout.exercises.filter((exercise) => {
    const entered = exercise.sets.filter(
      (set) => set.weight !== '' && set.reps !== '',
    )
    return entered.length > 0 && entered.every((set) => set.done)
  }).length

  const progress = Math.round(
    (completedExercises / Math.max(1, workout.exercises.length)) * 100,
  )

  const currentExercise =
    workout.exercises[activeExercise] ?? workout.exercises[0]

  const elapsedSeconds = Math.max(
    0,
    Math.floor(
      (
        now -
        new Date(
          workout.startedAt ??
          Date.now(),
        ).getTime()
      ) / 1000,
    ),
  )

  const elapsedHours = Math.floor(
    elapsedSeconds / 3600,
  )
  const elapsedMinutes = Math.floor(
    (elapsedSeconds % 3600) / 60,
  )
  const elapsedRemainderSeconds =
    elapsedSeconds % 60

  const elapsedLabel =
    elapsedHours > 0
      ? `${elapsedHours}:${String(
          elapsedMinutes,
        ).padStart(2, '0')}:${String(
          elapsedRemainderSeconds,
        ).padStart(2, '0')}`
      : `${elapsedMinutes}:${String(
          elapsedRemainderSeconds,
        ).padStart(2, '0')}`

  const restLabel = `${Math.floor(
    restRemaining / 60,
  )}:${String(
    restRemaining % 60,
  ).padStart(2, '0')}`

  const startRest = ({
    exercise,
    setIndex,
    potentialPr,
  }) => {
    setRestContext({
      exercise: exercise.name,
      setNumber: setIndex + 1,
      potentialPr,
    })
    setRestRemaining(restDuration)
    setRestRunning(true)

    if (navigator.vibrate) {
      navigator.vibrate(12)
    }
  }

  const supersetGroup = currentExercise.supersetGroup
  const supersetExercises = supersetGroup
    ? workout.exercises.filter(
        (exercise) => exercise.supersetGroup === supersetGroup,
      )
    : []
  const supersetRounds = supersetExercises.length
    ? Math.max(...supersetExercises.map((exercise) => exercise.sets.length))
    : 0

  return (
    <div
      className="focus-mode"
      style={{
        '--active-muscle-accent': currentExercise.muscle,
        '--muscle-light': MUSCLE_LIGHTS[currentExercise.muscle] || MUSCLE_LIGHTS.Other,
      }}
    >

      <section className="focus-mode-bar lift-session-overview">
        <div className="gym-workout-heading">
          <span className="eyebrow">GYM MODE</span>
          <div className="gym-workout-title-row">
            <h2>{workout.name}</h2>
            <button
              className="change-workout-button"
              onClick={() => setShowWorkoutPicker(true)}
            >
              <RefreshCw size={13} /> Change
            </button>
          </div>
          <div className="lift-overview-meta">
            <span>
              {completedExercises} of {workout.exercises.length} complete
            </span>

            <span>
              <Clock3 size={13} />
              {elapsedLabel}
            </span>
          </div>
        </div>
        <ProgressRing value={progress} />
      </section>

      {executionPlan?.maxMinutes ? (
        <section className="gym-execution-focus-banner" aria-label="Session execution focus">
          <span className="eyebrow">{executionPlan.maxMinutes}-MINUTE FOCUS</span>
          {executionPlan.priorityExerciseNames?.length ? (
            <p>
              Priority: {executionPlan.priorityExerciseNames.join(' · ')}
            </p>
          ) : null}
          {executionPlan.accessoryExerciseNames?.length ? (
            <small>Accessory work if time allows</small>
          ) : null}
          {executionPlan.coachAssigned ? (
            <small className="gym-coach-protected">Coach program stays unchanged</small>
          ) : null}
        </section>
      ) : null}

      <section className="lift-session-notes">
        <button
          className="lift-session-notes-toggle"
          onClick={() =>
            setShowSessionNotes(
              (current) => !current,
            )
          }
        >
          <span>
            <StickyNote size={16} />
            <span>
              <strong>Session Intent & Notes</strong>
              <small>
                Keep the purpose of today’s work clear.
              </small>
            </span>
          </span>

          <span>
            {showSessionNotes ? 'Hide' : 'Open'}
          </span>
        </button>

        {showSessionNotes && (
          <div className="lift-session-notes-fields">
            <label>
              <span>Today’s intention</span>
              <input
                value={workout.intent ?? ''}
                onChange={(event) =>
                  onWorkoutMetaChange?.(
                    'intent',
                    event.target.value,
                  )
                }
                placeholder="Example: Controlled reps and strong bracing."
                maxLength={140}
              />
            </label>

            <label>
              <span>Session notes</span>
              <textarea
                value={workout.notes ?? ''}
                onChange={(event) =>
                  onWorkoutMetaChange?.(
                    'notes',
                    event.target.value,
                  )
                }
                placeholder="Technique cues, pain-free substitutions, or anything worth remembering."
                rows={3}
                maxLength={500}
              />
            </label>
          </div>
        )}
      </section>

      {supersetGroup ? (
        <SupersetFocus
          exercises={supersetExercises}
          group={supersetGroup}
          round={Math.min(supersetRound, Math.max(0, supersetRounds - 1))}
          totalRounds={supersetRounds}
          onSetChange={(exerciseId, setIndex, key, value) => {
            const exerciseIndex = workout.exercises.findIndex(
              (exercise) => exercise.id === exerciseId,
            )
            onSetChange(exerciseIndex, setIndex, key, value)
          }}
          onPreviousRound={() =>
            setSupersetRound(Math.max(0, supersetRound - 1))
          }
          onNextRound={() =>
            setSupersetRound(
              Math.min(supersetRounds - 1, supersetRound + 1),
            )
          }
          onAddRound={() => {
            supersetExercises.forEach((exercise) => {
              const exerciseIndex = workout.exercises.findIndex(
                (item) => item.id === exercise.id,
              )
              onAddSet(exerciseIndex)
            })
            setSupersetRound(supersetRounds)
          }}
        />
      ) : (
        <FocusExercise
          key={currentExercise.id}
          exercise={currentExercise}
          exerciseIndex={activeExercise}
          totalExercises={workout.exercises.length}
          previousSets={recentExerciseSets(state.history, currentExercise.name)}
          executionRole={currentExerciseRole}
          onSetChange={(setIndex, key, value) =>
            onSetChange(activeExercise, setIndex, key, value)
          }
          onAddSet={() => onAddSet(activeExercise)}
          onPrevious={goPrevious}
          onNext={goNext}
          onRepeatSet={(setIndex) => onRepeatSet(activeExercise, setIndex)}
          onSkipExercise={() => onSkipExercise(activeExercise)}
          onQuickAdd={() => setShowQuickAdd(true)}
          onRemoveSet={(setIndex) => onRemoveSet(activeExercise, setIndex)}
          onUndoSkip={() => onUndoSkip(activeExercise)}
          navigationDirection={navigationDirection}
          onSetCompleted={startRest}
        />
      )}

      {showWorkoutPicker &&
        createPortal(
          <div
            className="modal-backdrop workout-picker-portal"
            onClick={() => setShowWorkoutPicker(false)}
          >
            <section
              className="workout-change-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <span className="eyebrow">CURRENT SESSION</span>
                  <h2>Change Workout</h2>
                </div>
                <button onClick={() => setShowWorkoutPicker(false)}>
                  <X size={20} />
                </button>
              </header>

              <p>
                Choose the workout you want to perform today. If you have entered
                any set data, The Foundry will ask before replacing it.
              </p>

              <div className="workout-change-list">
                {workoutOptions.map((option) => (
                  <button
                    key={option}
                    className={option === workout.name ? 'active' : ''}
                    disabled={option === workout.name}
                    onClick={() => {
                      onChangeWorkout(option)
                      setShowWorkoutPicker(false)
                    }}
                  >
                    <span>{option}</span>
                    <small>
                      {option === workout.name ? 'Current workout' : 'Switch'}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          </div>,
          document.body,
        )}

      {showWorkoutMenu &&
        createPortal(
          <div
            className="modal-backdrop workout-menu-portal"
            onClick={() => setShowWorkoutMenu(false)}
          >
            <section
              className="workout-options-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="workout-options-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <span className="eyebrow">CURRENT SESSION</span>
                  <h2 id="workout-options-title">
                    Workout Options
                  </h2>
                </div>
                <button
                  className="workout-options-close"
                  onClick={() => setShowWorkoutMenu(false)}
                  aria-label="Close workout options"
                >
                  <X size={20} />
                </button>
              </header>

              <p>
                Manage the active workout without adding
                anything to your training history unless you
                choose Finish Workout.
              </p>

              <div className="lift-rest-preference">
                <div>
                  <strong>Default Rest Timer</strong>
                  <small>
                    Starts automatically after a completed set.
                  </small>
                </div>

                <select
                  value={restDuration}
                  onChange={(event) =>
                    setRestDuration(
                      Number(event.target.value),
                    )
                  }
                >
                  <option value={60}>1:00</option>
                  <option value={90}>1:30</option>
                  <option value={120}>2:00</option>
                  <option value={180}>3:00</option>
                </select>
              </div>

              <div className="workout-options-list">
                <button
                  onClick={() => {
                    setShowWorkoutMenu(false)
                    setShowWorkoutPicker(true)
                  }}
                >
                  <div className="workout-option-icon">
                    <RefreshCw size={18} />
                  </div>
                  <div>
                    <strong>Change Workout</strong>
                    <small>
                      Replace this session with another workout.
                    </small>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setShowWorkoutMenu(false)
                    onRestartWorkout?.()
                  }}
                >
                  <div className="workout-option-icon">
                    <RotateCcw size={18} />
                  </div>
                  <div>
                    <strong>Restart Workout</strong>
                    <small>
                      Clear all entered progress and begin again.
                    </small>
                  </div>
                </button>

                <button
                  className="danger"
                  onClick={() => {
                    setShowWorkoutMenu(false)
                    onEndWorkout?.()
                  }}
                >
                  <div className="workout-option-icon">
                    <LogOut size={18} />
                  </div>
                  <div>
                    <strong>End Without Saving</strong>
                    <small>
                      Remove the active session without affecting
                      History, Journey, Forge, streaks, or volume.
                    </small>
                  </div>
                </button>
              </div>

              <button
                className="workout-options-cancel"
                onClick={() => setShowWorkoutMenu(false)}
              >
                Cancel
              </button>
            </section>
          </div>,
          document.body,
        )}

      {showQuickAdd && (
        <QuickAddModal
          onClose={() => setShowQuickAdd(false)}
          onAdd={(exercise) => {
            onQuickAddExercise(exercise)
            setShowQuickAdd(false)
          }}
        />
      )}

      {restContext && (
        <section
          className={`lift-rest-dock ${
            restRunning ? 'running' : 'paused'
          } ${
            restRemaining === 0 ? 'complete' : ''
          }`}
        >
          <div className="lift-rest-copy">
            <span className="eyebrow">
              {restRemaining === 0
                ? 'REST COMPLETE'
                : 'BETWEEN SETS'}
            </span>
            <strong>{restLabel}</strong>
            <small>
              {restContext.exercise} · Set{' '}
              {restContext.setNumber}
              {restContext.potentialPr
                ? ' · PR effort'
                : ''}
            </small>
          </div>

          <div className="lift-rest-actions">
            <button
              onClick={() =>
                setRestRunning(
                  (current) => !current,
                )
              }
              disabled={restRemaining === 0}
              aria-label={
                restRunning
                  ? 'Pause rest timer'
                  : 'Resume rest timer'
              }
            >
              {restRunning ? (
                <Pause size={17} />
              ) : (
                <Play size={17} />
              )}
            </button>

            <button
              onClick={() => {
                setRestRemaining(
                  (current) => current + 30,
                )
                setRestRunning(true)
              }}
              aria-label="Add 30 seconds"
            >
              +30
            </button>

            <button
              onClick={() => {
                setRestRemaining(restDuration)
                setRestRunning(true)
              }}
              aria-label="Restart rest timer"
            >
              <TimerReset size={17} />
            </button>

            <button
              className="lift-rest-dismiss"
              onClick={() => {
                setRestRunning(false)
                setRestContext(null)
                setRestRemaining(0)
              }}
            >
              Done
            </button>
          </div>

          <div
            className="lift-rest-progress"
            style={{
              '--rest-progress':
                restDuration > 0
                  ? `${
                      (
                        1 -
                        restRemaining /
                          Math.max(
                            restDuration,
                            restRemaining,
                          )
                      ) * 100
                    }%`
                  : '100%',
            }}
          />
        </section>
      )}

      <div className="focus-finish-bar">
        <button
          className="focus-more-button"
          aria-label="Workout options"
          onClick={() => setShowWorkoutMenu(true)}
        >
          <MoreHorizontal />
        </button>
        <button
          className="gold-button machined"
          disabled={isFinishing}
          onClick={onFinish}
        >
          {isFinishing ? 'Saving Workout…' : 'Finish Workout'}
        </button>
      </div>
    </div>
  )
}
