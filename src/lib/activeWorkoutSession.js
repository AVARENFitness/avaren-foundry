export const computeRestRemainingSeconds = (endsAt, now = Date.now()) => {
  if (!endsAt) return 0
  return Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - now) / 1000),
  )
}

export const isRestTimerActive = (restTimer, now = Date.now()) =>
  Boolean(
    restTimer?.endsAt &&
      computeRestRemainingSeconds(restTimer.endsAt, now) > 0,
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
