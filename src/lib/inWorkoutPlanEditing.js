import { isFreeformWorkoutSession } from './freeformWorkout'

export const canEditActiveWorkoutPlan = (state = {}) => {
  const workout = state.activeWorkout
  if (!workout) return false
  if (workout.assignmentId) return false
  if (isFreeformWorkoutSession(workout)) return false

  const template = state.program?.workouts?.[workout.name]
  return Array.isArray(template)
}

export const buildPlanExerciseFromQuickAdd = ({
  name,
  sets,
  muscle,
  loadType = null,
} = {}) => ({
  name: String(name ?? '').trim(),
  sets: Math.max(1, Number(sets) || 3),
  muscle: muscle ?? 'Other',
  supersetGroup: '',
  ...(loadType ? { loadType } : {}),
})

const findTemplateAnchorIndex = (template = [], activeExercise = null) => {
  if (!Array.isArray(template) || !activeExercise) return null

  const exact = template.findIndex(
    (item) =>
      String(item?.name ?? '').trim().toLowerCase() ===
      String(activeExercise?.name ?? '').trim().toLowerCase(),
  )

  return exact >= 0 ? exact : null
}

export const addExerciseToWorkoutPlan = (
  program,
  workout,
  exercise,
  activeExercise = null,
) => {
  if (!program?.workouts || !workout?.name || !exercise?.name) return program

  const template = program.workouts[workout.name]
  if (!Array.isArray(template)) return program

  const next = structuredClone(program)
  const target = next.workouts[workout.name]
  const anchorIndex = findTemplateAnchorIndex(template, activeExercise)

  if (anchorIndex == null) {
    target.push(exercise)
  } else {
    target.splice(anchorIndex + 1, 0, exercise)
  }

  return next
}

export const removeExerciseFromWorkoutPlan = (
  program,
  workout,
  exercise,
) => {
  if (!program?.workouts || !workout?.name || !exercise?.name) return program

  const template = program.workouts[workout.name]
  if (!Array.isArray(template)) return program

  const removeIndex = template.findIndex(
    (item) =>
      String(item?.name ?? '').trim().toLowerCase() ===
      String(exercise?.name ?? '').trim().toLowerCase(),
  )

  if (removeIndex < 0) return program

  const next = structuredClone(program)
  next.workouts[workout.name].splice(removeIndex, 1)
  return next
}
