import { describe, expect, it } from 'vitest'
import { makeActiveSet } from './materializeWorkoutExercise'
import {
  getContinueActionLabel,
  getInitialSupersetRound,
  getNextExerciseIndex,
  getNextWorkoutStep,
  getPreviousExerciseIndex,
  getSupersetRoundCount,
  hasRemainingExercisesAfter,
  isAtLastWorkoutStep,
  isSupersetComplete,
  isSupersetRoundComplete,
  isWorkoutComplete,
  shouldShowContinueAction,
  shouldShowFinishWorkoutPrimary,
} from './workoutProgression'

function makeExercise(name, { sets = 3, supersetGroup = '' } = {}) {
  return {
    id: name,
    name,
    muscle: 'Other',
    supersetGroup,
    loadType: 'external',
    sets: Array.from({ length: sets }, (_, index) =>
      makeActiveSet(index + 1, 'Working'),
    ),
  }
}

function completeSet(exercise, setIndex) {
  exercise.sets[setIndex].weight = 25
  exercise.sets[setIndex].reps = 10
  exercise.sets[setIndex].done = true
}

function completeExercise(exercise) {
  exercise.sets.forEach((_, index) => completeSet(exercise, index))
}

function buildArmsRegressionWorkout() {
  return [
    makeExercise('Exercise 1'),
    makeExercise('Exercise 2'),
    makeExercise('Lateral Raise', { supersetGroup: 'A' }),
    makeExercise('Incline Curl', { supersetGroup: 'A' }),
    makeExercise('Exercise 4'),
    makeExercise('Exercise 5'),
  ]
}

describe('workoutProgression', () => {
  it('advances standalone to standalone', () => {
    const exercises = [
      makeExercise('One'),
      makeExercise('Two'),
      makeExercise('Three'),
    ]

    expect(getNextExerciseIndex(exercises, 0)).toBe(1)
    expect(getNextExerciseIndex(exercises, 1)).toBe(2)
    expect(getPreviousExerciseIndex(exercises, 2)).toBe(1)
  })

  it('advances standalone to superset start', () => {
    const exercises = [
      makeExercise('One'),
      makeExercise('Two', { supersetGroup: 'A' }),
      makeExercise('Three', { supersetGroup: 'A' }),
      makeExercise('Four'),
    ]

    expect(getNextExerciseIndex(exercises, 0)).toBe(1)
    expect(getPreviousExerciseIndex(exercises, 2)).toBe(0)
  })

  it('advances superset block to standalone', () => {
    const exercises = [
      makeExercise('One'),
      makeExercise('Two', { supersetGroup: 'A' }),
      makeExercise('Three', { supersetGroup: 'A' }),
      makeExercise('Four'),
    ]

    expect(getNextExerciseIndex(exercises, 1)).toBe(3)
    expect(getNextExerciseIndex(exercises, 2)).toBe(3)
  })

  it('advances superset to superset', () => {
    const exercises = [
      makeExercise('A1', { supersetGroup: 'A' }),
      makeExercise('A2', { supersetGroup: 'A' }),
      makeExercise('B1', { supersetGroup: 'B' }),
      makeExercise('B2', { supersetGroup: 'B' }),
    ]

    expect(getNextExerciseIndex(exercises, 0)).toBe(2)
    expect(getNextExerciseIndex(exercises, 1)).toBe(2)
  })

  it('marks final standalone as workout complete step', () => {
    const exercises = [makeExercise('One'), makeExercise('Two')]
    completeExercise(exercises[0])
    completeExercise(exercises[1])

    expect(isAtLastWorkoutStep(exercises, 1)).toBe(true)
    expect(getNextWorkoutStep(exercises, 1).type).toBe('workout_complete')
    expect(isWorkoutComplete(exercises)).toBe(true)
  })

  it('marks final superset as workout complete step', () => {
    const exercises = [
      makeExercise('A1', { supersetGroup: 'A' }),
      makeExercise('A2', { supersetGroup: 'A' }),
    ]

    completeExercise(exercises[0])
    completeExercise(exercises[1])

    expect(isAtLastWorkoutStep(exercises, 0)).toBe(true)
    expect(getNextWorkoutStep(exercises, 0).type).toBe('workout_complete')
  })

  it('does not treat mid-workout superset completion as workout complete', () => {
    const exercises = buildArmsRegressionWorkout()
    const lateralRaise = exercises[2]
    const inclineCurl = exercises[3]

    completeExercise(lateralRaise)
    completeExercise(inclineCurl)

    expect(isWorkoutComplete(exercises)).toBe(false)
    expect(hasRemainingExercisesAfter(exercises, 2)).toBe(true)
    expect(getNextExerciseIndex(exercises, 2)).toBe(4)
    expect(getNextExerciseIndex(exercises, 3)).toBe(4)
    expect(isAtLastWorkoutStep(exercises, 2)).toBe(false)
    expect(getNextWorkoutStep(exercises, 2).type).toBe('exercise')
    expect(getNextWorkoutStep(exercises, 2).exerciseIndex).toBe(4)
  })

  it('does not expose continue before superset rounds are complete', () => {
    const exercises = buildArmsRegressionWorkout()
    completeSet(exercises[2], 0)

    expect(shouldShowContinueAction(exercises, 2)).toBe(false)
  })

  it('arms regression exposes continue action instead of finish-only', () => {
    const exercises = buildArmsRegressionWorkout()
    completeExercise(exercises[2])
    completeExercise(exercises[3])

    expect(shouldShowFinishWorkoutPrimary(exercises, 2)).toBe(false)
    expect(shouldShowContinueAction(exercises, 2)).toBe(true)
    expect(getContinueActionLabel(exercises, 2)).toBe('Next Exercise')
  })

  it('preserves superset round progression before leaving the group', () => {
    const exercises = [
      makeExercise('A1', { supersetGroup: 'A', sets: 3 }),
      makeExercise('A2', { supersetGroup: 'A', sets: 3 }),
      makeExercise('Four'),
    ]

    completeSet(exercises[0], 0)
    completeSet(exercises[1], 0)

    expect(isSupersetRoundComplete(exercises, 'A', 0)).toBe(true)
    expect(getNextWorkoutStep(exercises, 0).type).toBe('superset_round')
    expect(getNextWorkoutStep(exercises, 0).supersetRound).toBe(1)
  })

  it('tracks superset completion across all rounds', () => {
    const exercises = [
      makeExercise('A1', { supersetGroup: 'A', sets: 2 }),
      makeExercise('A2', { supersetGroup: 'A', sets: 2 }),
    ]

    completeSet(exercises[0], 0)
    completeSet(exercises[1], 0)
    expect(isSupersetComplete(exercises, 'A')).toBe(false)

    completeSet(exercises[0], 1)
    completeSet(exercises[1], 1)
    expect(isSupersetComplete(exercises, 'A')).toBe(true)
  })

  it('restores initial superset round from incomplete progress', () => {
    const exercises = [
      makeExercise('A1', { supersetGroup: 'A', sets: 3 }),
      makeExercise('A2', { supersetGroup: 'A', sets: 3 }),
    ]

    completeSet(exercises[0], 0)
    completeSet(exercises[1], 0)
    completeSet(exercises[0], 1)

    expect(getInitialSupersetRound(exercises, 'A')).toBe(1)
    expect(getSupersetRoundCount(exercises, 'A')).toBe(3)
  })

  it('supports standalone → superset → standalone navigation', () => {
    const exercises = [
      makeExercise('One'),
      makeExercise('A1', { supersetGroup: 'A' }),
      makeExercise('A2', { supersetGroup: 'A' }),
      makeExercise('Four'),
    ]

    expect(getNextExerciseIndex(exercises, 0)).toBe(1)
    expect(getNextExerciseIndex(exercises, 1)).toBe(3)
    expect(getPreviousExerciseIndex(exercises, 3)).toBe(1)
  })

  it('supports superset → standalone → superset navigation', () => {
    const exercises = [
      makeExercise('A1', { supersetGroup: 'A' }),
      makeExercise('A2', { supersetGroup: 'A' }),
      makeExercise('Three'),
      makeExercise('B1', { supersetGroup: 'B' }),
      makeExercise('B2', { supersetGroup: 'B' }),
    ]

    expect(getNextExerciseIndex(exercises, 0)).toBe(2)
    expect(getNextExerciseIndex(exercises, 2)).toBe(3)
    expect(getPreviousExerciseIndex(exercises, 3)).toBe(2)
    expect(getPreviousExerciseIndex(exercises, 2)).toBe(0)
  })
})
