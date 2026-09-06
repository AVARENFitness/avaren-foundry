import {
  externalLoadAmount,
  formatCompletedSetDisplay,
  isActiveSetEntered,
  isComparableForLoadPr,
  LOAD_TYPES,
  resolveSetLoadType,
} from './exerciseLoad'
import { recentExerciseSets } from './metrics'

export const estimatedOneRepMax = (weight, reps) => {
  const numericWeight = Number(weight || 0)
  const numericReps = Number(reps || 0)

  if (!numericWeight || !numericReps) return 0
  if (numericReps === 1) return numericWeight

  return numericWeight * (1 + numericReps / 30)
}

/**
 * Shared previous-session / PR context for FocusExercise and SupersetFocus.
 * Matching uses the same recentExerciseSets(history, exerciseName) helper as
 * standalone Gym Mode — exact name match, no competing PR path.
 */
export const previousSetsForExercise = (history, exercise) => {
  const name = typeof exercise === 'string' ? exercise : exercise?.name
  if (!name) return []
  return recentExerciseSets(history ?? [], name)
}

export const historicalSetsForExercise = (history = [], exercise) => {
  const name = typeof exercise === 'string' ? exercise : exercise?.name
  if (!name) return []

  return (history ?? []).flatMap((session) =>
    (session?.sets ?? []).filter((set) => set?.exercise === name),
  )
}

const setReps = (set) => Number(set?.reps || 0)

const assistanceAmount = (set) => {
  const value = Number(set?.assistance ?? set?.weight ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Heaviest / best historical set using existing load-domain rules.
 * - external / bw+added: highest comparable load, then reps
 * - bodyweight: highest reps (never "0 lb")
 * - assisted: lower assistance is stronger; never treat more assistance as a PR
 */
export const selectHeaviestHistoricalSet = (sets = []) => {
  const list = Array.isArray(sets) ? sets.filter(Boolean) : []
  if (!list.length) return null

  return list.reduce((best, set) => {
    if (!best) return set

    const bestType = resolveSetLoadType(best, best.loadType)
    const setType = resolveSetLoadType(set, set.loadType)

    if (
      isComparableForLoadPr(set) &&
      isComparableForLoadPr(best) &&
      bestType === setType
    ) {
      const bestLoad = externalLoadAmount(best, bestType)
      const setLoad = externalLoadAmount(set, setType)
      if (setLoad > bestLoad) return set
      if (setLoad === bestLoad && setReps(set) > setReps(best)) return set
      return best
    }

    if (setType === LOAD_TYPES.BODYWEIGHT && bestType === LOAD_TYPES.BODYWEIGHT) {
      return setReps(set) > setReps(best) ? set : best
    }

    if (setType === LOAD_TYPES.ASSISTED && bestType === LOAD_TYPES.ASSISTED) {
      const bestAssist = assistanceAmount(best)
      const setAssist = assistanceAmount(set)
      if (bestAssist === 0 && setAssist > 0) return set
      if (setAssist === 0 && bestAssist > 0) return best
      if (setAssist > 0 && bestAssist > 0) {
        if (setAssist < bestAssist) return set
        if (setAssist === bestAssist && setReps(set) > setReps(best)) return set
        return best
      }
      return setReps(set) > setReps(best) ? set : best
    }

    // Prefer comparable load sets over non-comparable when mixed history exists.
    if (isComparableForLoadPr(set) && !isComparableForLoadPr(best)) return set
    if (!isComparableForLoadPr(set) && isComparableForLoadPr(best)) return best

    return setReps(set) > setReps(best) ? set : best
  }, null)
}

/**
 * Previous-session summary using the same set formatting as Best.
 * Uses the strongest set from the last session only.
 */
export const formatPreviousPerformanceDisplay = (previousSets = []) => {
  const sets = Array.isArray(previousSets) ? previousSets.filter(Boolean) : []
  if (!sets.length) return null

  const representative = selectHeaviestHistoricalSet(sets)
  return formatBestSetDisplay(representative)
}

export const formatBestSetDisplay = (bestSet) => {
  if (!bestSet) return null

  const loadType = resolveSetLoadType(bestSet, bestSet.loadType)

  if (loadType === LOAD_TYPES.EXTERNAL) {
    const load = externalLoadAmount(bestSet, loadType)
    const reps = setReps(bestSet)
    if (load > 0 && reps > 0) return `${load} lb × ${reps}`
  }

  if (loadType === LOAD_TYPES.BODYWEIGHT_ADDED) {
    const load = externalLoadAmount(bestSet, loadType)
    const reps = setReps(bestSet)
    if (load > 0 && reps > 0) return `BW + ${load} lb × ${reps}`
  }

  return formatCompletedSetDisplay(bestSet)
}

export const buildExercisePreviousContext = (
  previousSets = [],
  loadType,
) => {
  const sets = Array.isArray(previousSets) ? previousSets : []

  const lastSessionBest = sets.length
    ? sets.reduce((best, set) => {
        const bestLoad = externalLoadAmount(best, loadType)
        const setLoad = externalLoadAmount(set, loadType)
        if (setLoad > bestLoad) return set
        if (
          setLoad === bestLoad &&
          Number(set.reps) > Number(best?.reps || 0)
        ) {
          return set
        }
        return best
      }, sets[0])
    : null

  const previousBestWeight = Math.max(
    0,
    ...sets.map((set) => externalLoadAmount(set, loadType)),
  )

  const previousBestEstimatedMax = Math.max(
    0,
    ...sets.map((set) => estimatedOneRepMax(set.weight, set.reps)),
  )

  const potentialPrForSet = (set) => {
    const currentEstimatedMax = estimatedOneRepMax(set.weight, set.reps)

    const potentialWeightPr =
      isComparableForLoadPr({ loadType }) &&
      externalLoadAmount({ ...set, loadType }, loadType) >
        previousBestWeight

    const potentialStrengthPr =
      isComparableForLoadPr({ loadType }) &&
      previousBestEstimatedMax > 0 &&
      currentEstimatedMax > previousBestEstimatedMax

    const potentialPr =
      sets.length > 0 &&
      isActiveSetEntered(set, loadType) &&
      (potentialWeightPr || potentialStrengthPr)

    return {
      potentialWeightPr,
      potentialStrengthPr,
      potentialPr,
    }
  }

  return {
    previousSets: sets,
    lastSessionBest,
    previousBestWeight,
    previousBestEstimatedMax,
    potentialPrForSet,
  }
}

/**
 * Compact Previous + Best glance for the active exercise header.
 * History-only: current unfinished workout must not be passed in `history`.
 */
export const buildExerciseHistoryGlance = (
  history = [],
  exercise,
  loadType,
) => {
  const previousSets = previousSetsForExercise(history, exercise)
  const historicalSets = historicalSetsForExercise(history, exercise)
  const previousContext = buildExercisePreviousContext(previousSets, loadType)
  const bestSet = selectHeaviestHistoricalSet(historicalSets)
  const previousDisplay = formatPreviousPerformanceDisplay(previousSets)
  const bestDisplay = formatBestSetDisplay(bestSet)
  const hasHistory = previousSets.length > 0 || Boolean(bestSet)

  return {
    ...previousContext,
    historicalSets,
    bestSet,
    previousDisplay,
    bestDisplay,
    hasHistory,
    emptyLabel: 'No previous performance',
  }
}
