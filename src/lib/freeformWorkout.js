import { createRuntimeId } from './createRuntimeId'
import { localCalendarDateKey } from './localCalendarDay'

export const OPEN_WORKOUT_NAME = 'Open Workout'
export const OPEN_WORKOUT_KEY = 'open-workout'

export const WORKOUT_ORIGIN = {
  FREEFORM: 'freeform',
}

export const isFreeformWorkoutSession = (session = null) =>
  session?.origin === WORKOUT_ORIGIN.FREEFORM

/**
 * Blank active session for unplanned training.
 * Does not reference program templates, rotation, or coach assignments.
 */
export const createFreeformActiveWorkout = ({
  id = createRuntimeId(),
  startedAt = new Date(),
} = {}) => {
  const started =
    startedAt instanceof Date ? startedAt : new Date(startedAt)
  const startedIso = Number.isFinite(started.getTime())
    ? started.toISOString()
    : new Date().toISOString()

  return {
    id,
    name: OPEN_WORKOUT_NAME,
    workoutKey: OPEN_WORKOUT_KEY,
    origin: WORKOUT_ORIGIN.FREEFORM,
    date: localCalendarDateKey(started),
    startedAt: startedIso,
    activeExerciseIndex: 0,
    exercises: [],
    assignmentId: null,
  }
}
