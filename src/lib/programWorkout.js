import { resolveTodayWorkoutContext, WORKOUT_SOURCE } from './todayWorkout'

const todayKey = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 10)

export const WORKOUT_RECOMMENDATION_STATE = {
  ACTIVE_WORKOUT: 'active-workout',
  COACH_ASSIGNMENT: 'coach-assignment',
  WORKOUT_DUE_TODAY: 'workout-due-today',
  COMPLETED_TODAY: 'completed-today',
  NEXT_WORKOUT_TOMORROW: 'next-workout-tomorrow',
  REST_DAY: 'rest-day',
  NO_ACTIVE_PROGRAM: 'no-active-program',
}

export const findCompletedWorkoutToday = (history = [], now = new Date()) => {
  const key = todayKey(now)
  return (history ?? []).find((session) => {
    const finished =
      session?.finishedAt ??
      (session?.date ? `${session.date}T12:00:00` : null)
    return finished && todayKey(new Date(finished)) === key
  })
}

export const normalizeRotation = (rotation = []) =>
  (rotation ?? []).filter(Boolean)

export const normalizeProgramWorkoutName = (value) => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value.name) return String(value.name)
  return null
}

/**
 * Advance program.nextWorkout after completing a session.
 * Uses completed workout position when it exists in rotation; otherwise
 * advances from the current pointer without wrapping to index 0.
 */
export const advanceProgramNextWorkout = ({
  rotation = [],
  completedWorkoutName = null,
  currentNextWorkout = null,
} = {}) => {
  const names = normalizeRotation(rotation)
  if (!names.length) {
    return normalizeProgramWorkoutName(currentNextWorkout)
  }

  const completedName = normalizeProgramWorkoutName(completedWorkoutName)
  const pointerName = normalizeProgramWorkoutName(currentNextWorkout)

  const completedIndex = completedName ? names.indexOf(completedName) : -1

  if (completedIndex >= 0) {
    return names[(completedIndex + 1) % names.length]
  }

  const pointerIndex = pointerName ? names.indexOf(pointerName) : -1

  if (pointerIndex >= 0) {
    return names[(pointerIndex + 1) % names.length]
  }

  return pointerName ?? names[0] ?? null
}

export const resolveNextRecommendedWorkout = (state = {}, now = new Date()) => {
  const rotation = normalizeRotation(state.program?.rotation)
  const completedToday = findCompletedWorkoutToday(state.history, now)

  if (completedToday?.name) {
    return advanceProgramNextWorkout({
      rotation,
      completedWorkoutName: completedToday.name,
      currentNextWorkout: state.program?.nextWorkout,
    })
  }

  return (
    normalizeProgramWorkoutName(state.program?.nextWorkout) ??
    rotation[0] ??
    null
  )
}

export const listProgramWorkoutChoices = (state = {}) => {
  const rotation = normalizeRotation(state.program?.rotation)
  const workoutKeys = Object.keys(state.program?.workouts ?? {})
  const ordered = rotation.filter((name) => workoutKeys.includes(name))
  const extras = workoutKeys.filter((name) => !ordered.includes(name))
  return [...ordered, ...extras]
}

const tomorrowLabel = (now = new Date()) => {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

const tomorrowDateKey = (now = new Date()) => {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().slice(0, 10)
}

/**
 * Canonical workout recommendation — all athlete surfaces should consume this.
 */
export const resolveWorkoutRecommendation = (
  state = {},
  context = {},
  now = new Date(),
) => {
  const todayContext = resolveTodayWorkoutContext(state, { ...context, now })
  const completedToday = Boolean(todayContext.completedToday)
  const completedWorkoutName = todayContext.completedWorkoutName ?? null
  const todayWorkout = todayContext.name ?? null
  const nextWorkout = resolveNextRecommendedWorkout(state, now)
  const nextWorkoutDate = completedToday ? tomorrowDateKey(now) : todayKey(now)
  const nextWorkoutLabel = completedToday
    ? `Tomorrow · ${tomorrowLabel(now)}`
    : 'Today'
  const canStartAnotherToday =
    completedToday && listProgramWorkoutChoices(state).length > 0

  if (state.activeWorkout?.name) {
    return {
      completedToday: false,
      completedWorkoutName: null,
      todayWorkout: state.activeWorkout.name,
      nextWorkout,
      nextWorkoutDate,
      nextWorkoutLabel,
      canStartAnotherToday: false,
      recommendationState: WORKOUT_RECOMMENDATION_STATE.ACTIVE_WORKOUT,
      todayContext,
    }
  }

  if (
    todayContext.source === WORKOUT_SOURCE.COACH_ASSIGNMENT &&
    todayWorkout
  ) {
    return {
      completedToday: false,
      completedWorkoutName: null,
      todayWorkout,
      nextWorkout: todayWorkout,
      nextWorkoutDate: todayKey(now),
      nextWorkoutLabel: 'Today',
      canStartAnotherToday: false,
      recommendationState: WORKOUT_RECOMMENDATION_STATE.COACH_ASSIGNMENT,
      todayContext,
    }
  }

  if (completedToday && !todayWorkout) {
    return {
      completedToday: true,
      completedWorkoutName,
      todayWorkout: null,
      nextWorkout,
      nextWorkoutDate,
      nextWorkoutLabel,
      canStartAnotherToday,
      recommendationState: WORKOUT_RECOMMENDATION_STATE.COMPLETED_TODAY,
      todayContext,
    }
  }

  if (todayContext.isRestDay && !todayWorkout) {
    return {
      completedToday: false,
      completedWorkoutName: null,
      todayWorkout: null,
      nextWorkout,
      nextWorkoutDate,
      nextWorkoutLabel: nextWorkout ? nextWorkoutLabel : null,
      canStartAnotherToday: false,
      recommendationState: WORKOUT_RECOMMENDATION_STATE.REST_DAY,
      todayContext,
    }
  }

  if (todayWorkout) {
    return {
      completedToday: false,
      completedWorkoutName: null,
      todayWorkout,
      nextWorkout: todayWorkout,
      nextWorkoutDate: todayKey(now),
      nextWorkoutLabel: 'Today',
      canStartAnotherToday: false,
      recommendationState: WORKOUT_RECOMMENDATION_STATE.WORKOUT_DUE_TODAY,
      todayContext,
    }
  }

  return {
    completedToday: false,
    completedWorkoutName: null,
    todayWorkout: null,
    nextWorkout,
    nextWorkoutDate,
    nextWorkoutLabel: nextWorkout ? nextWorkoutLabel : null,
    canStartAnotherToday: false,
    recommendationState: WORKOUT_RECOMMENDATION_STATE.NO_ACTIVE_PROGRAM,
    todayContext,
  }
}

export const resolveWorkoutDaySummary = (state = {}, context = {}, now = new Date()) => {
  const recommendation = resolveWorkoutRecommendation(state, context, now)

  return {
    completedToday: recommendation.completedToday,
    completedWorkoutName: recommendation.completedWorkoutName,
    recommendedTodayWorkout: recommendation.todayWorkout,
    nextRecommendedWorkout: recommendation.nextWorkout,
    nextRecommendedLabel: recommendation.completedToday
      ? recommendation.nextWorkoutLabel
      : null,
    recommendation,
  }
}
