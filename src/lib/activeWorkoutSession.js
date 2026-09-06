export const computeRestRemainingSeconds = (endsAt, now = Date.now()) => {
  if (!endsAt) return 0
  return Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - now) / 1000),
  )
}

export const getRestTimerRemainingSeconds = (restTimer, now = Date.now()) => {
  if (!restTimer?.endsAt) return 0
  if (restTimer.paused) {
    return Math.max(0, Number(restTimer.pausedRemaining) || 0)
  }
  return computeRestRemainingSeconds(restTimer.endsAt, now)
}

export const isRestTimerActive = (restTimer, now = Date.now()) =>
  Boolean(
    restTimer?.endsAt &&
      !restTimer.paused &&
      computeRestRemainingSeconds(restTimer.endsAt, now) > 0,
  )

export const isRestTimerVisible = (restTimer, now = Date.now()) =>
  Boolean(
    restTimer?.endsAt &&
      (restTimer.paused ||
        computeRestRemainingSeconds(restTimer.endsAt, now) > 0),
  )

export const shouldResumeActiveWorkoutScreen = ({
  activeWorkout = null,
  coachModeEnabled = false,
  currentScreen = 'home',
} = {}) =>
  Boolean(activeWorkout) &&
  !coachModeEnabled &&
  currentScreen !== 'gym' &&
  currentScreen !== 'complete'

/**
 * Resolve which exercise the athlete is adding from.
 * Returns that index when valid; otherwise null (append fallback).
 */
export const resolveQuickAddAfterIndex = ({
  exercises = [],
  activeExerciseIndex = null,
} = {}) => {
  const list = Array.isArray(exercises) ? exercises : []
  if (!list.length) return null
  if (activeExerciseIndex == null || activeExerciseIndex === '') return null

  const index = Number(activeExerciseIndex)
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    return null
  }

  return index
}

/**
 * Insert a session exercise immediately after `afterIndex`.
 * When afterIndex is null/invalid, appends (safe fallback).
 */
export const insertExerciseAfterIndex = (
  exercises = [],
  exercise,
  afterIndex = null,
) => {
  const list = Array.isArray(exercises) ? [...exercises] : []
  if (!exercise) return list
  if (afterIndex == null || afterIndex === '') {
    list.push(exercise)
    return list
  }

  const index = Number(afterIndex)
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    list.push(exercise)
    return list
  }

  list.splice(index + 1, 0, exercise)
  return list
}
