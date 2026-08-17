import { isActiveSetEntered } from './exerciseLoad'

export function getSupersetMemberIndices(exercises, group) {
  if (!group) return []
  return exercises
    .map((exercise, index) => (exercise.supersetGroup === group ? index : -1))
    .filter((index) => index >= 0)
}

export function getSupersetBounds(exercises, exerciseIndex) {
  const exercise = exercises[exerciseIndex]
  if (!exercise) {
    return { start: 0, end: 0, group: null, indices: [0] }
  }

  if (!exercise.supersetGroup) {
    return {
      start: exerciseIndex,
      end: exerciseIndex,
      group: null,
      indices: [exerciseIndex],
    }
  }

  const indices = getSupersetMemberIndices(
    exercises,
    exercise.supersetGroup,
  )

  return {
    start: indices[0],
    end: indices[indices.length - 1],
    group: exercise.supersetGroup,
    indices,
  }
}

export function getSupersetExercises(exercises, group) {
  return exercises.filter((exercise) => exercise.supersetGroup === group)
}

export function getSupersetRoundCount(exercises, group) {
  const members = getSupersetExercises(exercises, group)
  if (!members.length) return 0
  return Math.max(...members.map((exercise) => exercise.sets.length))
}

export function isSupersetRoundComplete(exercises, group, round) {
  const members = getSupersetExercises(exercises, group)
  return members.every((exercise) => exercise.sets[round]?.done)
}

export function isExerciseComplete(exercise) {
  if (exercise.skipped) return true
  const entered = exercise.sets.filter((set) =>
    isActiveSetEntered(set, exercise.loadType),
  )
  return entered.length > 0 && entered.every((set) => set.done)
}

export function isSupersetComplete(exercises, group) {
  const members = getSupersetExercises(exercises, group)
  if (!members.length) return false
  return members.every((exercise) => {
    if (exercise.skipped) return true
    return (
      exercise.sets.length > 0 &&
      exercise.sets.every((set) => set.done)
    )
  })
}

export function getInitialSupersetRound(exercises, group) {
  const totalRounds = getSupersetRoundCount(exercises, group)
  for (let round = 0; round < totalRounds; round += 1) {
    if (!isSupersetRoundComplete(exercises, group, round)) {
      return round
    }
  }
  return Math.max(0, totalRounds - 1)
}

export function getNextExerciseIndex(exercises, currentIndex) {
  if (!exercises.length) return 0
  const bounds = getSupersetBounds(exercises, currentIndex)
  if (bounds.end < exercises.length - 1) {
    return bounds.end + 1
  }
  return currentIndex
}

export function getPreviousExerciseIndex(exercises, currentIndex) {
  if (currentIndex <= 0) return 0
  const bounds = getSupersetBounds(exercises, currentIndex)
  if (bounds.start <= 0) return 0
  const previousIndex = bounds.start - 1
  return getSupersetBounds(exercises, previousIndex).start
}

export function hasRemainingExercisesAfter(exercises, currentIndex) {
  return getNextExerciseIndex(exercises, currentIndex) > currentIndex
}

export function isAtLastWorkoutStep(exercises, currentIndex) {
  return !hasRemainingExercisesAfter(exercises, currentIndex)
}

export function isWorkoutComplete(exercises) {
  if (!exercises.length) return true
  return exercises.every(isExerciseComplete)
}

export function getNextWorkoutStep(
  exercises,
  currentIndex,
  supersetRoundByGroup = {},
) {
  const bounds = getSupersetBounds(exercises, currentIndex)

  if (bounds.group) {
    const group = bounds.group
    const totalRounds = getSupersetRoundCount(exercises, group)
    const round =
      supersetRoundByGroup[group] ??
      getInitialSupersetRound(exercises, group)

    if (!isSupersetComplete(exercises, group)) {
      for (
        let candidate = Math.min(round, totalRounds - 1);
        candidate >= 0;
        candidate -= 1
      ) {
        if (
          isSupersetRoundComplete(exercises, group, candidate) &&
          candidate < totalRounds - 1
        ) {
          return {
            type: 'superset_round',
            exerciseIndex: bounds.start,
            supersetGroup: group,
            supersetRound: candidate + 1,
          }
        }
      }
    }

    if (hasRemainingExercisesAfter(exercises, currentIndex)) {
      return {
        type: 'exercise',
        exerciseIndex: getNextExerciseIndex(exercises, currentIndex),
        supersetGroup: null,
        supersetRound: null,
      }
    }

    return { type: 'workout_complete', exerciseIndex: currentIndex }
  }

  if (hasRemainingExercisesAfter(exercises, currentIndex)) {
    return {
      type: 'exercise',
      exerciseIndex: getNextExerciseIndex(exercises, currentIndex),
      supersetGroup: null,
      supersetRound: null,
    }
  }

  return { type: 'workout_complete', exerciseIndex: currentIndex }
}

export function shouldShowFinishWorkoutPrimary(exercises, currentIndex) {
  return (
    isAtLastWorkoutStep(exercises, currentIndex) &&
    isWorkoutComplete(exercises)
  )
}

export function shouldShowContinueAction(
  exercises,
  currentIndex,
  supersetRoundByGroup = {},
) {
  if (shouldShowFinishWorkoutPrimary(exercises, currentIndex)) {
    return false
  }

  const bounds = getSupersetBounds(exercises, currentIndex)

  if (bounds.group) {
    const group = bounds.group
    const round =
      supersetRoundByGroup[group] ??
      getInitialSupersetRound(exercises, group)
    const totalRounds = getSupersetRoundCount(exercises, group)

    if (!isSupersetComplete(exercises, group)) {
      for (
        let candidate = Math.min(round, totalRounds - 1);
        candidate >= 0;
        candidate -= 1
      ) {
        if (
          isSupersetRoundComplete(exercises, group, candidate) &&
          candidate < totalRounds - 1
        ) {
          return true
        }
      }
    }

    return (
      isSupersetComplete(exercises, group) &&
      hasRemainingExercisesAfter(exercises, currentIndex)
    )
  }

  return hasRemainingExercisesAfter(exercises, currentIndex)
}

export function getContinueActionLabel(
  exercises,
  currentIndex,
  supersetRoundByGroup = {},
) {
  const step = getNextWorkoutStep(
    exercises,
    currentIndex,
    supersetRoundByGroup,
  )

  if (step.type === 'superset_round') {
    return 'Next Round'
  }

  if (step.type === 'exercise') {
    const nextExercise = exercises[step.exerciseIndex]
    if (nextExercise?.supersetGroup) {
      return 'Continue to Superset'
    }
    return 'Next Exercise'
  }

  return 'Continue'
}
