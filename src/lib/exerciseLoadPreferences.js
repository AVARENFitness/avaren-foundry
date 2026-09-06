import { LOAD_TYPES, normalizeLoadType } from './exerciseLoad'

const VALID_LOAD_TYPES = new Set(Object.values(LOAD_TYPES))

export const isValidStoredLoadType = (value) => VALID_LOAD_TYPES.has(value)

export const normalizeExerciseLoadNameKey = (value = '') =>
  String(value).trim().toLowerCase()

/**
 * Stable preference identity for an exercise definition or active exercise.
 * Prefer explicit catalog/source keys; never use ephemeral runtime ids alone.
 */
export const exerciseLoadIdentityKeys = (exercise = {}) => {
  const keys = []
  const stableId =
    exercise.exerciseKey ??
    exercise.canonicalId ??
    exercise.sourceExerciseId ??
    exercise.catalogId ??
    exercise.exerciseId ??
    null

  if (stableId != null && String(stableId).trim() !== '') {
    keys.push(`id:${String(stableId).trim()}`)
  }

  const name = normalizeExerciseLoadNameKey(exercise.name)
  if (name) keys.push(`name:${name}`)

  return keys
}

export const rememberExerciseLoadType = (
  preferences = {},
  exercise = {},
  loadType,
) => {
  const normalized = normalizeLoadType(loadType, exercise.name)
  if (!isValidStoredLoadType(normalized)) return preferences ?? {}

  const next = { ...(preferences ?? {}) }
  for (const key of exerciseLoadIdentityKeys(exercise)) {
    next[key] = normalized
  }
  return next
}

export const rememberLoadTypesFromSession = (
  preferences = {},
  session = {},
) => {
  let next = { ...(preferences ?? {}) }

  const performed = Array.isArray(session.exercisesPerformed)
    ? session.exercisesPerformed
    : []

  for (const exercise of performed) {
    if (exercise?.skipped) continue
    if (!exercise?.loadType) continue
    next = rememberExerciseLoadType(next, exercise, exercise.loadType)
  }

  const sets = Array.isArray(session.sets) ? session.sets : []
  for (const set of [...sets].reverse()) {
    if (!set?.exercise || !set?.loadType) continue
    next = rememberExerciseLoadType(
      next,
      { name: set.exercise },
      set.loadType,
    )
  }

  return next
}

export const mostRecentLoadTypeFromHistory = (history = [], exercise = {}) => {
  const nameKey = normalizeExerciseLoadNameKey(
    typeof exercise === 'string' ? exercise : exercise?.name,
  )
  if (!nameKey) return null

  for (const session of [...(history ?? [])].reverse()) {
    const performed = Array.isArray(session?.exercisesPerformed)
      ? session.exercisesPerformed
      : []
    for (const item of [...performed].reverse()) {
      if (normalizeExerciseLoadNameKey(item?.name) !== nameKey) continue
      if (item?.skipped) continue
      if (isValidStoredLoadType(item?.loadType)) return item.loadType
    }

    const sets = Array.isArray(session?.sets) ? session.sets : []
    for (const set of [...sets].reverse()) {
      if (normalizeExerciseLoadNameKey(set?.exercise) !== nameKey) continue
      if (isValidStoredLoadType(set?.loadType)) return set.loadType
    }
  }

  return null
}

/**
 * Athlete execution preference → history → template/default.
 * Does not mutate the template exercise object.
 */
export const resolvePreferredLoadType = (
  exercise = {},
  {
    loadPreferences = {},
    history = [],
  } = {},
) => {
  for (const key of exerciseLoadIdentityKeys(exercise)) {
    const preferred = loadPreferences?.[key]
    if (isValidStoredLoadType(preferred)) return preferred
  }

  const fromHistory = mostRecentLoadTypeFromHistory(history, exercise)
  if (fromHistory) return fromHistory

  return normalizeLoadType(exercise.loadType, exercise.name)
}
