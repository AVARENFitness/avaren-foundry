import { COMMON_EXERCISES } from '../data/commonExercises'
import { estimatedOneRepMax as calcE1rm } from './metrics'
import {
  expandUnilateralPerformances,
  isUnilateralExercise,
  resolveSidesMode,
  SIDES_MODE,
} from './unilateralExercise'

const normalizeExerciseName = (value = '') =>
  String(value).trim().toLowerCase()

const exerciseLookup = (() => {
  const map = new Map()
  COMMON_EXERCISES.forEach((exercise) => {
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

export const LOAD_TYPES = {
  EXTERNAL: 'external',
  BODYWEIGHT: 'bodyweight',
  BODYWEIGHT_ADDED: 'bodyweight_added',
  ASSISTED: 'assisted',
}

export const LOAD_TYPE_OPTIONS = [
  { value: LOAD_TYPES.EXTERNAL, label: 'Weight' },
  { value: LOAD_TYPES.BODYWEIGHT, label: 'Bodyweight' },
  { value: LOAD_TYPES.BODYWEIGHT_ADDED, label: 'Bodyweight + weight' },
  { value: LOAD_TYPES.ASSISTED, label: 'Assisted' },
]

const VALID_LOAD_TYPES = new Set(Object.values(LOAD_TYPES))

export const normalizeLoadType = (value, exerciseName = '') => {
  if (VALID_LOAD_TYPES.has(value)) return value
  return suggestDefaultLoadType(exerciseName)
}

export const suggestDefaultLoadType = (exerciseName = '') => {
  const name = String(exerciseName).trim().toLowerCase()
  const meta = getExerciseMetadata(exerciseName)

  if (meta?.equipment === 'Bodyweight') {
    return LOAD_TYPES.BODYWEIGHT
  }

  if (
    /pull-up|pullup|chin-up|chinup|push-up|pushup|dip|leg raise|hanging leg|inverted row|air squat|burpee|sit-up|situp|plank hold/i.test(
      name,
    )
  ) {
    return LOAD_TYPES.BODYWEIGHT
  }

  return LOAD_TYPES.EXTERNAL
}

export const loadTypeLabel = (loadType) =>
  LOAD_TYPE_OPTIONS.find((option) => option.value === loadType)?.label ??
  'Weight'

export const loadTypeRequiresWeightInput = (loadType) =>
  loadType === LOAD_TYPES.EXTERNAL ||
  loadType === LOAD_TYPES.BODYWEIGHT_ADDED ||
  loadType === LOAD_TYPES.ASSISTED

export const resolveSetLoadType = (set = {}, exerciseLoadType) =>
  normalizeLoadType(
    set.loadType ?? exerciseLoadType ?? LOAD_TYPES.EXTERNAL,
    set.exercise ?? '',
  )

export const isActiveSetEntered = (set = {}, loadType = LOAD_TYPES.EXTERNAL) => {
  const mode = resolveSidesMode(set, set.exercise)
  if (mode === SIDES_MODE.DIFFERENT) {
    const leftOk = isActiveSetEntered(
      {
        weight: set?.left?.weight ?? '',
        reps: set?.left?.reps ?? '',
        loadType: set.loadType,
        exercise: set.exercise,
      },
      loadType,
    )
    const rightOk = isActiveSetEntered(
      {
        weight: set?.right?.weight ?? '',
        reps: set?.right?.reps ?? '',
        loadType: set.loadType,
        exercise: set.exercise,
      },
      loadType,
    )
    return leftOk && rightOk
  }

  const reps = Number(set.reps)
  if (!Number.isFinite(reps) || reps <= 0) return false

  if (loadType === LOAD_TYPES.BODYWEIGHT) return true

  const weight = Number(set.weight)
  if (set.weight === '' || !Number.isFinite(weight)) return false
  if (loadType === LOAD_TYPES.ASSISTED && weight <= 0) return false
  if (loadType === LOAD_TYPES.EXTERNAL && weight <= 0) return false
  if (loadType === LOAD_TYPES.BODYWEIGHT_ADDED && weight < 0) return false

  return true
}

export const externalLoadAmount = (set = {}, loadType) => {
  const resolved = resolveSetLoadType(set, loadType)
  const weight = Number(set.weight ?? set.addedWeight ?? 0)

  if (resolved === LOAD_TYPES.EXTERNAL) {
    return Number.isFinite(weight) && weight > 0 ? weight : 0
  }

  if (resolved === LOAD_TYPES.BODYWEIGHT_ADDED) {
    const added = Number(set.addedWeight ?? set.weight ?? 0)
    return Number.isFinite(added) && added > 0 ? added : 0
  }

  return 0
}

export const formatCompletedSetDisplay = (set = {}) => {
  const loadType = resolveSetLoadType(set, set.loadType)
  const exerciseName = set.exercise ?? ''
  const mode = resolveSidesMode(set, exerciseName)

  const formatSideLoad = (weight, reps) => {
    const numericReps = Number(reps ?? 0)
    if (loadType === LOAD_TYPES.BODYWEIGHT) {
      return numericReps > 0 ? `BW × ${numericReps}` : 'BW'
    }
    if (loadType === LOAD_TYPES.BODYWEIGHT_ADDED) {
      const added = Number(weight ?? 0)
      return added > 0
        ? `BW + ${added} lb × ${numericReps}`
        : `BW × ${numericReps}`
    }
    if (loadType === LOAD_TYPES.ASSISTED) {
      const assistance = Number(weight ?? 0)
      return assistance > 0
        ? `${assistance} lb assist × ${numericReps}`
        : `Assist × ${numericReps}`
    }
    const numericWeight = Number(weight ?? 0)
    if (numericWeight > 0 && numericReps > 0) {
      return `${numericWeight} lb × ${numericReps}`
    }
    if (numericReps > 0) return `${numericReps} reps`
    return '—'
  }

  if (mode === SIDES_MODE.DIFFERENT) {
    const left = formatSideLoad(set?.left?.weight, set?.left?.reps)
    const right = formatSideLoad(set?.right?.weight, set?.right?.reps)
    return `L ${left} · R ${right}`
  }

  if (mode === SIDES_MODE.SHARED) {
    const reps = Number(set.reps ?? 0)
    if (loadType === LOAD_TYPES.BODYWEIGHT) {
      return reps > 0 ? `BW × ${reps}/side` : 'BW'
    }
    if (loadType === LOAD_TYPES.BODYWEIGHT_ADDED) {
      const added = Number(set.addedWeight ?? set.weight ?? 0)
      return added > 0
        ? `BW + ${added} lb × ${reps}/side`
        : `BW × ${reps}/side`
    }
    if (loadType === LOAD_TYPES.ASSISTED) {
      const assistance = Number(set.assistance ?? set.weight ?? 0)
      return assistance > 0
        ? `${assistance} lb assist × ${reps}/side`
        : `Assist × ${reps}/side`
    }
    const weight = Number(set.weight ?? 0)
    if (weight > 0 && reps > 0) return `${weight} lb × ${reps}/side`
    if (reps > 0) return `${reps} reps/side`
    return '—'
  }

  const reps = Number(set.reps ?? 0)

  if (loadType === LOAD_TYPES.BODYWEIGHT) {
    return reps > 0 ? `BW × ${reps}` : 'BW'
  }

  if (loadType === LOAD_TYPES.BODYWEIGHT_ADDED) {
    const added = Number(set.addedWeight ?? set.weight ?? 0)
    return added > 0 ? `BW + ${added} lb × ${reps}` : `BW × ${reps}`
  }

  if (loadType === LOAD_TYPES.ASSISTED) {
    const assistance = Number(set.assistance ?? set.weight ?? 0)
    return assistance > 0
      ? `${assistance} lb assist × ${reps}`
      : `Assist × ${reps}`
  }

  const weight = Number(set.weight ?? 0)
  if (weight > 0 && reps > 0) return `${weight} × ${reps}`
  if (reps > 0) return `${reps} reps`
  return '—'
}

export const formatLegacyCompletedSetDisplay = (set = {}) => {
  if (set.loadType) return formatCompletedSetDisplay(set)

  const weight = Number(set.weight ?? 0)
  const reps = Number(set.reps ?? 0)

  if (weight > 0 && reps > 0) return `${weight} × ${reps}`
  if (reps > 0 && weight === 0) return `${reps} reps`
  return '—'
}

export const buildCompletedSet = ({
  exercise,
  set,
  bodyweightAtSession = null,
}) => {
  const loadType = normalizeLoadType(exercise.loadType, exercise.name)
  const mode = resolveSidesMode(
    { ...set, exercise: exercise.name },
    exercise,
  )
  const performances = expandUnilateralPerformances(
    { ...set, exercise: exercise.name },
    exercise,
  )
  const primary = performances[0] ?? {
    weight: Number(set.weight || 0),
    reps: Number(set.reps || 0),
  }
  const reps = Number(primary.reps || 0)
  const rawWeight = Number(primary.weight || 0)

  const completed = {
    exercise: exercise.name,
    muscle: exercise.muscle,
    type: set.type,
    loadType,
    reps,
  }

  if (mode) {
    completed.sidesMode = mode
    if (mode === SIDES_MODE.DIFFERENT) {
      completed.left = {
        weight: Number(set?.left?.weight ?? 0),
        reps: Number(set?.left?.reps ?? 0),
      }
      completed.right = {
        weight: Number(set?.right?.weight ?? 0),
        reps: Number(set?.right?.reps ?? 0),
      }
      // Keep top-level reps as a per-side representative (never doubled).
      completed.reps = Math.max(completed.left.reps, completed.right.reps)
      completed.weight =
        loadType === LOAD_TYPES.EXTERNAL ||
        loadType === LOAD_TYPES.BODYWEIGHT_ADDED
          ? Math.max(completed.left.weight, completed.right.weight)
          : rawWeight
    }
  }

  if (loadType === LOAD_TYPES.EXTERNAL) {
    if (completed.weight == null) completed.weight = rawWeight
    const e1rmWeight =
      mode === SIDES_MODE.SHARED
        ? rawWeight
        : mode === SIDES_MODE.DIFFERENT
          ? Math.max(completed.left.weight, completed.right.weight)
          : rawWeight
    const e1rmReps =
      mode === SIDES_MODE.SHARED
        ? reps
        : mode === SIDES_MODE.DIFFERENT
          ? Math.max(completed.left.reps, completed.right.reps)
          : reps
    completed.estimatedOneRepMax =
      e1rmWeight > 0 && e1rmReps > 0 ? calcE1rm(e1rmWeight, e1rmReps) : 0
  } else if (loadType === LOAD_TYPES.BODYWEIGHT) {
    completed.weight = 0
    completed.estimatedOneRepMax = 0
  } else if (loadType === LOAD_TYPES.BODYWEIGHT_ADDED) {
    completed.addedWeight = rawWeight
    if (completed.weight == null) completed.weight = rawWeight
    completed.estimatedOneRepMax =
      rawWeight > 0 && reps > 0 ? calcE1rm(rawWeight, reps) : 0
  } else if (loadType === LOAD_TYPES.ASSISTED) {
    completed.assistance = rawWeight
    completed.weight = 0
    completed.estimatedOneRepMax = 0
  }

  if (
    bodyweightAtSession != null &&
    Number.isFinite(Number(bodyweightAtSession)) &&
    Number(bodyweightAtSession) > 0
  ) {
    completed.bodyweightAtSession = Number(bodyweightAtSession)
  }

  if (exercise.prescription) {
    completed.prescription = exercise.prescription
  }

  if (isUnilateralExercise(exercise)) {
    completed.unilateral = true
  }

  return completed
}

export const isComparableForLoadPr = (set = {}) => {
  const loadType = resolveSetLoadType(set, set.loadType)
  return (
    loadType === LOAD_TYPES.EXTERNAL ||
    loadType === LOAD_TYPES.BODYWEIGHT_ADDED
  )
}
