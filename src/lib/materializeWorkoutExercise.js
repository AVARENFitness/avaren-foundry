import { createRuntimeId } from './createRuntimeId'
import { normalizeLoadType } from './exerciseLoad'
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

export const materializeWorkoutExercise = (exercise = {}) => {
  const prescription = normalizePrescription(exercise)
  const loadType = normalizeLoadType(exercise.loadType, exercise.name)
  const setCount = prescribedSetCount(prescription)

  return {
    id: createRuntimeId(),
    name: exercise.name,
    muscle: exercise.muscle ?? 'Other',
    supersetGroup: exercise.supersetGroup || '',
    loadType,
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
