import { Dumbbell, MoreHorizontal, RefreshCw, RotateCcw, X, LogOut } from 'lucide-react'
import FocusExercise from '../components/FocusExercise'
import ProgressRing from '../components/ProgressRing'
import QuickAddModal from '../components/QuickAddModal'
import SupersetFocus from '../components/SupersetFocus'
import { useEffect, useMemo, useState } from 'react'
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
import {
  activeWorkoutSnapshot,
  compareActiveWorkout,
  recentExerciseSets,
} from '../lib/metrics'

export default function GymScreen({
  state,
  onStart,
  activeExercise,
  setActiveExercise,
  onSetChange,
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
  const [clockTick, setClockTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(
      () => setClockTick((value) => value + 1),
      1000,
    )

    return () => window.clearInterval(timer)
  }, [])


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

  const liveSnapshot = useMemo(
    () => activeWorkoutSnapshot(workout),
    [workout, clockTick],
  )
  const comparison = useMemo(
    () => compareActiveWorkout(workout, state.history),
    [workout, state.history, clockTick],
  )

  const formatElapsed = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60

    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(
          remainingSeconds,
        ).padStart(2, '0')}`
      : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
  }

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
      <section className="living-workout-dashboard">
        <header>
          <div>
            <span className="eyebrow">LIVE SESSION</span>
            <h1>{workout.name}</h1>
          </div>
          <div className="living-workout-clock">
            <span>Elapsed</span>
            <strong>
              {formatElapsed(liveSnapshot.elapsedSeconds)}
            </strong>
          </div>
        </header>

        <div className="living-workout-metrics">
          <article>
            <span>Volume</span>
            <strong>
              {Math.round(
                liveSnapshot.volume,
              ).toLocaleString()}
              <small> lb</small>
            </strong>
          </article>
          <article>
            <span>Sets</span>
            <strong>
              {liveSnapshot.completedSets}
              <small> / {liveSnapshot.totalSets}</small>
            </strong>
          </article>
          <article>
            <span>Exercises</span>
            <strong>
              {liveSnapshot.completedExercises}
              <small> / {liveSnapshot.totalExercises}</small>
            </strong>
          </article>
          <article>
            <span>Intensity</span>
            <strong>{liveSnapshot.intensity}</strong>
          </article>
        </div>

        <div className="living-workout-insight">
          <span>Session insight</span>
          <strong>{comparison.message}</strong>
        </div>
      </section>

      {workout.recommendation && (
        <section className="gym-recommendation-banner">
          <span className="eyebrow">APPLIED GUIDANCE</span>
          <strong>{workout.recommendation.title}</strong>
          <p>{workout.recommendation.summary}</p>
          <div>
            {workout.recommendation.plan
              .slice(0, 3)
              .map((item) => (
                <span key={item}>{item}</span>
              ))}
          </div>
        </section>
      )}

      {!workout.recommendation && recommendation && (
        <section className="gym-recommendation-banner preview">
          <span className="eyebrow">TODAY’S GUIDANCE</span>
          <strong>{recommendation.title}</strong>
          <p>{recommendation.summary}</p>
        </section>
      )}

      <section className="focus-mode-bar">
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
          <p>{completedExercises} of {workout.exercises.length} complete</p>
        </div>
        <ProgressRing value={progress} />
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
          liveSnapshot={liveSnapshot}
          comparison={comparison}
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
