import { createRuntimeId } from './createRuntimeId'
import { normalizeLoadType } from './exerciseLoad'
import { resolvePreferredLoadType } from './exerciseLoadPreferences'
import { normalizePrescription, prescribedSetCount } from './exercisePrescription'

const WARM_UP_EXERCISES = new Set([
  'Bench Press',
  'Barbell Squats',
  'Standing Barbell Press',
])

export const makeActiveSet = (number, type = 'Working') => ({
  id: createRuntimeId(),
  number,
  type,
  weight: '',
  reps: '',
  done: false,
})

export const materializeWorkoutExercise = (exercise = {}, options = {}) => {
  const prescription = normalizePrescription(exercise)
  const sourceExerciseId =
    exercise.exerciseKey ??
    exercise.canonicalId ??
    exercise.sourceExerciseId ??
    exercise.catalogId ??
    exercise.exerciseId ??
    (exercise.id != null && String(exercise.id).trim() !== ''
      ? exercise.id
      : null)

  const loadType = resolvePreferredLoadType(
    {
      ...exercise,
      sourceExerciseId,
    },
    {
      loadPreferences: options.loadPreferences,
      history: options.history,
    },
  )

  const setCount = prescribedSetCount(prescription)

  return {
    id: createRuntimeId(),
    sourceExerciseId: sourceExerciseId ?? null,
    name: exercise.name,
    muscle: exercise.muscle ?? 'Other',
    supersetGroup: exercise.supersetGroup || '',
    loadType: normalizeLoadType(loadType, exercise.name),
    prescription,
    sets: Array.from({ length: setCount }, (_, index) =>
      makeActiveSet(
        index + 1,
        index === 0 && WARM_UP_EXERCISES.has(exercise.name)
          ? 'Warm-up'
          : 'Working',
      ),
    ),
  }
}
