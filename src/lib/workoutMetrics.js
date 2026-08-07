import { COMMON_EXERCISES } from '../data/commonExercises'
import { estimatedOneRepMax as calcE1rm } from './metrics'

export const MEASUREMENT_MODES = {
  WEIGHTED_REPS: 'weighted-reps',
  BODYWEIGHT_REPS: 'bodyweight-reps',
  DURATION: 'duration',
  DISTANCE: 'distance',
  UNSUPPORTED: 'unsupported',
}

const LOAD_EQUIPMENT = new Set([
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Kettlebell',
  'Smith Machine',
  'Trap Bar',
  'EZ Bar',
])

const NON_LOAD_PATTERNS =
  /stretch|mobility|reset|recovery flow|dead bug|bird dog|toe touch|plank|hollow|crunch|leg lift|mason twist|superman|wall sit|farmer carry|suitcase carry/i

const MAX_REASONABLE_WEIGHT = 1500
const MAX_REASONABLE_REPS = 100

const normalizeExerciseName = (value = '') =>
  String(value).trim().toLowerCase()

const exerciseLookup = (() => {
  const map = new Map()
  COMMON_EXERCISES.forEach((exercise) => {
    map.set(normalizeExerciseName(exercise.name), exercise)
  })
  return map
})()

export const getExerciseMetadata = (exerciseName = '') => {
  const key = normalizeExerciseName(exerciseName)
  if (!key) return null

  if (exerciseLookup.has(key)) {
    return exerciseLookup.get(key)
  }

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

export const getExerciseMeasurementMode = (exerciseName = '', set = {}) => {
  const meta = getExerciseMetadata(exerciseName)
  const name = normalizeExerciseName(exerciseName)

  if (set?.measurementMode) return set.measurementMode
  if (set?.durationSeconds > 0 || set?.duration > 0) {
    return MEASUREMENT_MODES.DURATION
  }
  if (set?.distance > 0) return MEASUREMENT_MODES.DISTANCE

  if (meta?.equipment === 'Bodyweight') {
    return MEASUREMENT_MODES.BODYWEIGHT_REPS
  }

  if (meta?.equipment && LOAD_EQUIPMENT.has(meta.equipment)) {
    return MEASUREMENT_MODES.WEIGHTED_REPS
  }

  if (NON_LOAD_PATTERNS.test(name)) {
    return MEASUREMENT_MODES.UNSUPPORTED
  }

  if (
    /bench|squat|press|row|curl|deadlift|pulldown|extension|shrug|raise|fly|lunge|thrust|clean|snatch/i.test(
      name,
    )
  ) {
    return MEASUREMENT_MODES.WEIGHTED_REPS
  }

  if (meta?.equipment) {
    return MEASUREMENT_MODES.UNSUPPORTED
  }

  return MEASUREMENT_MODES.UNSUPPORTED
}

export const isLoadTrackedExercise = (exerciseName = '', set = {}) =>
  getExerciseMeasurementMode(exerciseName, set) ===
  MEASUREMENT_MODES.WEIGHTED_REPS

export const parseSetNumbers = (set = {}) => {
  const weight = Number(set.weight)
  const reps = Number(set.reps)
  return {
    weight: Number.isFinite(weight) ? weight : NaN,
    reps: Number.isFinite(reps) ? reps : NaN,
  }
}

export const isValidStrengthSet = (set = {}) => {
  const exercise = String(set?.exercise ?? '').trim()
  if (!exercise) return false
  if (!isLoadTrackedExercise(exercise, set)) return false

  const { weight, reps } = parseSetNumbers(set)
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return false
  if (weight <= 0 || reps <= 0) return false
  if (weight > MAX_REASONABLE_WEIGHT || reps > MAX_REASONABLE_REPS) return false

  return true
}

export const setLoadVolume = (set = {}) => {
  if (!isValidStrengthSet(set)) return 0
  const { weight, reps } = parseSetNumbers(set)
  return weight * reps
}

export const setEstimatedOneRepMax = (set = {}) => {
  if (!isValidStrengthSet(set)) return null

  const { weight, reps } = parseSetNumbers(set)
  const stored = Number(set.estimatedOneRepMax)
  if (Number.isFinite(stored) && stored > 0) return stored

  return calcE1rm(weight, reps)
}

export const sessionLoadVolume = (session = {}) => {
  const sets = session?.sets ?? []
  if (!Array.isArray(sets) || !sets.length) return 0

  return sets.reduce((sum, set) => sum + setLoadVolume(set), 0)
}

export const filterValidStrengthSets = (sets = []) =>
  (sets ?? []).filter(isValidStrengthSet)

export const isPlausiblePerformanceWin = (win) => {
  if (!win?.exercise || !win?.type || !win?.value) return false
  if (win.type === 'Session Volume') {
    const amount = Number(String(win.value).replace(/[^\d.]/g, ''))
    return Number.isFinite(amount) && amount >= 100
  }
  if (win.type === 'Estimated 1RM') {
    const amount = Number(String(win.value).replace(/[^\d.]/g, ''))
    return Number.isFinite(amount) && amount >= 45
  }
  if (win.type === 'Heaviest Set') {
    const [weightPart] = String(win.value).split('×')
    const amount = Number(weightPart?.trim())
    return Number.isFinite(amount) && amount >= 45
  }
  return false
}

export const selectAvaPerformanceWin = (history = [], now = new Date()) => {
  const weekMs = 7 * 86400000
  const prs = recentValidatedPRs(history, 20).filter((pr) => {
    const time = new Date(`${pr.date}T12:00:00`).getTime()
    return Number.isFinite(time) && now.getTime() - time <= weekMs
  })

  return prs.find(isPlausiblePerformanceWin) ?? null
}

export const recentValidatedPRs = (history = [], limit = 12) => {
  const records = {}
  const prs = []

  history.forEach((session) => {
    if (!session?.sets?.length) return

    const grouped = {}
    session.sets.forEach((set) => {
      if (!isValidStrengthSet(set)) return
      grouped[set.exercise] ??= []
      grouped[set.exercise].push(set)
    })

    Object.entries(grouped).forEach(([exercise, sets]) => {
      const heaviest = Math.max(
        ...sets.map((set) => parseSetNumbers(set).weight),
      )
      const bestE1RM = Math.max(
        ...sets.map((set) => setEstimatedOneRepMax(set) ?? 0),
      )
      const volume = sets.reduce((sum, set) => sum + setLoadVolume(set), 0)

      const previous = records[exercise] ?? {
        heaviest: 0,
        bestE1RM: 0,
        volume: 0,
      }

      if (heaviest > previous.heaviest) {
        const bestSet = sets.find(
          (set) => parseSetNumbers(set).weight === heaviest,
        )
        prs.push({
          id: `${session.id}-${exercise}-weight`,
          date: session.date,
          exercise,
          type: 'Heaviest Set',
          value: `${heaviest} × ${bestSet ? parseSetNumbers(bestSet).reps : 0}`,
        })
      }

      if (bestE1RM > previous.bestE1RM) {
        prs.push({
          id: `${session.id}-${exercise}-e1rm`,
          date: session.date,
          exercise,
          type: 'Estimated 1RM',
          value: `${Math.round(bestE1RM)} lb`,
        })
      }

      if (volume > previous.volume && volume >= 100) {
        prs.push({
          id: `${session.id}-${exercise}-volume`,
          date: session.date,
          exercise,
          type: 'Session Volume',
          value: `${Math.round(volume).toLocaleString()} lb`,
        })
      }

      records[exercise] = {
        heaviest: Math.max(previous.heaviest, heaviest),
        bestE1RM: Math.max(previous.bestE1RM, bestE1RM),
        volume: Math.max(previous.volume, volume),
      }
    })
  })

  return prs.reverse().slice(0, limit)
}
