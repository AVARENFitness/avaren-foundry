import { COMMON_EXERCISES } from '../data/commonExercises'

export const SIDES_MODE = {
  SHARED: 'shared',
  DIFFERENT: 'different',
}

const normalizeExerciseName = (value = '') =>
  String(value).trim().toLowerCase()

const exerciseLookup = (() => {
  const map = new Map()
  ;(COMMON_EXERCISES ?? []).forEach((exercise) => {
    map.set(normalizeExerciseName(exercise.name), exercise)
  })
  return map
})()

const getExerciseMetadata = (exerciseName = '') => {
  const key = normalizeExerciseName(exerciseName)
  if (!key) return null
  if (exerciseLookup.has(key)) return exerciseLookup.get(key)
  if (key.endsWith('es')) {
    const singular = key.slice(0, -2)
    if (exerciseLookup.has(singular)) return exerciseLookup.get(singular)
  }
  if (key.endsWith('s')) {
    const singular = key.slice(0, -1)
    if (exerciseLookup.has(singular)) return exerciseLookup.get(singular)
  }
  return null
}

/**
 * Clear unilateral phrases only — never treat all dumbbell work as unilateral.
 */
const UNILATERAL_NAME_PATTERN =
  /\b(single[-\s]?arm|one[-\s]?arm|single[-\s]?leg|one[-\s]?leg|unilateral)\b/i

export const resolveExerciseName = (exerciseOrName = '') => {
  if (!exerciseOrName) return ''
  if (typeof exerciseOrName === 'string') return exerciseOrName
  return String(exerciseOrName.name ?? '')
}

export const isUnilateralExercise = (exerciseOrName = '') => {
  if (
    exerciseOrName &&
    typeof exerciseOrName === 'object' &&
    (exerciseOrName.unilateral === true ||
      exerciseOrName.isUnilateral === true)
  ) {
    return true
  }

  const name = resolveExerciseName(exerciseOrName)
  const meta = getExerciseMetadata(name)
  if (meta?.unilateral === true || meta?.isUnilateral === true) {
    return true
  }

  return UNILATERAL_NAME_PATTERN.test(name)
}

export const resolveSidesMode = (set = {}, exerciseOrName = null) => {
  const name = resolveExerciseName(exerciseOrName ?? set?.exercise ?? '')
  if (!isUnilateralExercise(name || exerciseOrName)) return null
  if (set?.sidesMode === SIDES_MODE.DIFFERENT) return SIDES_MODE.DIFFERENT
  return SIDES_MODE.SHARED
}

export const sidesValuesEqual = (set = {}) => {
  const leftWeight = Number(set?.left?.weight ?? set?.weight ?? 0)
  const rightWeight = Number(set?.right?.weight ?? set?.weight ?? 0)
  const leftReps = Number(set?.left?.reps ?? set?.reps ?? 0)
  const rightReps = Number(set?.right?.reps ?? set?.reps ?? 0)
  return leftWeight === rightWeight && leftReps === rightReps
}

export const expandToDifferentSides = (set = {}) => ({
  ...set,
  sidesMode: SIDES_MODE.DIFFERENT,
  left: {
    weight: set?.left?.weight ?? set?.weight ?? '',
    reps: set?.left?.reps ?? set?.reps ?? '',
  },
  right: {
    weight: set?.right?.weight ?? set?.weight ?? '',
    reps: set?.right?.reps ?? set?.reps ?? '',
  },
})

/**
 * Collapse only when sides match. Unequal side data is preserved.
 */
export const collapseToSharedIfEqual = (set = {}) => {
  if (set?.sidesMode !== SIDES_MODE.DIFFERENT) {
    return {
      ...set,
      sidesMode: SIDES_MODE.SHARED,
    }
  }

  if (!sidesValuesEqual(set)) {
    return set
  }

  return {
    ...set,
    sidesMode: SIDES_MODE.SHARED,
    weight: set?.left?.weight ?? set?.weight ?? '',
    reps: set?.left?.reps ?? set?.reps ?? '',
  }
}

/**
 * Per-side performances used for PR comparison (never doubled totals).
 */
export const expandUnilateralPerformances = (
  set = {},
  exerciseOrName = null,
) => {
  const name = resolveExerciseName(exerciseOrName ?? set?.exercise ?? '')
  const mode = resolveSidesMode(set, name || exerciseOrName)

  if (!mode) {
    return [
      {
        side: null,
        weight: Number(set?.weight ?? 0),
        reps: Number(set?.reps ?? 0),
      },
    ]
  }

  if (mode === SIDES_MODE.DIFFERENT) {
    return [
      {
        side: 'left',
        weight: Number(set?.left?.weight ?? set?.weight ?? 0),
        reps: Number(set?.left?.reps ?? set?.reps ?? 0),
      },
      {
        side: 'right',
        weight: Number(set?.right?.weight ?? set?.weight ?? 0),
        reps: Number(set?.right?.reps ?? set?.reps ?? 0),
      },
    ]
  }

  return [
    {
      side: 'shared',
      weight: Number(set?.weight ?? 0),
      reps: Number(set?.reps ?? 0),
    },
  ]
}

export const setTotalReps = (set = {}, exerciseOrName = null) => {
  const name = resolveExerciseName(exerciseOrName ?? set?.exercise ?? '')
  const mode = resolveSidesMode(set, name || exerciseOrName)
  if (!mode) return Math.max(0, Number(set?.reps ?? 0) || 0)

  if (mode === SIDES_MODE.DIFFERENT) {
    return (
      Math.max(0, Number(set?.left?.reps ?? 0) || 0) +
      Math.max(0, Number(set?.right?.reps ?? 0) || 0)
    )
  }

  return Math.max(0, Number(set?.reps ?? 0) || 0) * 2
}

export const sessionTotalReps = (session = {}) =>
  (session?.sets ?? []).reduce(
    (sum, set) => sum + setTotalReps(set, set.exercise),
    0,
  )
