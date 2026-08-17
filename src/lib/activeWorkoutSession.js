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
