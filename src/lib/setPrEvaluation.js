import {
  externalLoadAmount,
  isActiveSetEntered,
  isComparableForLoadPr,
  LOAD_TYPES,
  resolveSetLoadType,
} from './exerciseLoad'
import { expandUnilateralPerformances } from './unilateralExercise'

const weightKey = (weight) => {
  const numeric = Number(weight)
  if (!Number.isFinite(numeric)) return '0'
  return String(Math.round(numeric * 1000) / 1000)
}

/**
 * Build chronological performance baselines from prior sets.
 * Uses per-side performances for unilateral sets (never doubled totals).
 */
export const buildPerformanceBaselines = (sets = [], loadType) => {
  let bestWeight = 0
  const bestRepsByWeight = new Map()

  ;(sets ?? []).forEach((set) => {
    const setLoadType = resolveSetLoadType(set, set.loadType ?? loadType)
    if (loadType && setLoadType !== loadType) return

    expandUnilateralPerformances(set, set.exercise).forEach((performance) => {
      const reps = Number(performance.reps || 0)
      if (!Number.isFinite(reps) || reps <= 0) return

      if (isComparableForLoadPr({ loadType: setLoadType })) {
        const load = externalLoadAmount(
          { ...set, weight: performance.weight, loadType: setLoadType },
          setLoadType,
        )
        if (load <= 0) return
        if (load > bestWeight) bestWeight = load
        const key = weightKey(load)
        const previous = bestRepsByWeight.get(key) ?? 0
        if (reps > previous) bestRepsByWeight.set(key, reps)
        return
      }

      if (setLoadType === LOAD_TYPES.BODYWEIGHT) {
        const key = weightKey(0)
        const previous = bestRepsByWeight.get(key) ?? 0
        if (reps > previous) bestRepsByWeight.set(key, reps)
      }
    })
  })

  return { bestWeight, bestRepsByWeight }
}

/**
 * Set-level PR rules (no estimated 1RM):
 * A) heavier valid load than prior best => weight PR
 * B) same prior weight with more per-side reps => rep PR
 *
 * Unilateral: compare per-side performances, never doubled total reps.
 * Different sides: set is a PR if any side establishes a new best.
 */
export const evaluateSetPr = ({
  set = {},
  loadType,
  historicalSets = [],
  earlierSets = [],
} = {}) => {
  const resolvedLoadType = resolveSetLoadType(set, loadType ?? set.loadType)
  const baselines = buildPerformanceBaselines(
    [...(historicalSets ?? []), ...(earlierSets ?? [])],
    resolvedLoadType,
  )

  if (!isActiveSetEntered(set, resolvedLoadType)) {
    return {
      isPr: false,
      isWeightPr: false,
      isRepPr: false,
      qualifyingSides: [],
    }
  }

  const hasPrior =
    baselines.bestWeight > 0 || baselines.bestRepsByWeight.size > 0
  if (!hasPrior) {
    return {
      isPr: false,
      isWeightPr: false,
      isRepPr: false,
      qualifyingSides: [],
    }
  }

  const performances = expandUnilateralPerformances(set, set.exercise)
  const qualifyingSides = []
  let isWeightPr = false
  let isRepPr = false

  performances.forEach((performance) => {
    const reps = Number(performance.reps || 0)
    if (!Number.isFinite(reps) || reps <= 0) return

    if (isComparableForLoadPr({ loadType: resolvedLoadType })) {
      const load = externalLoadAmount(
        { ...set, weight: performance.weight, loadType: resolvedLoadType },
        resolvedLoadType,
      )
      if (load <= 0) return

      const key = weightKey(load)
      const bestRepsAtWeight = baselines.bestRepsByWeight.get(key) ?? 0
      const weightPr = load > baselines.bestWeight
      const repPr =
        !weightPr &&
        baselines.bestRepsByWeight.has(key) &&
        reps > bestRepsAtWeight

      if (weightPr || repPr) {
        qualifyingSides.push(performance.side)
        if (weightPr) isWeightPr = true
        if (repPr) isRepPr = true
      }

      if (load > baselines.bestWeight) baselines.bestWeight = load
      if (reps > bestRepsAtWeight) {
        baselines.bestRepsByWeight.set(key, reps)
      }
      return
    }

    if (resolvedLoadType === LOAD_TYPES.BODYWEIGHT) {
      const key = weightKey(0)
      const bestReps = baselines.bestRepsByWeight.get(key) ?? 0
      if (reps > bestReps) {
        qualifyingSides.push(performance.side)
        isRepPr = true
        baselines.bestRepsByWeight.set(key, reps)
      }
    }
  })

  return {
    isPr: isWeightPr || isRepPr,
    isWeightPr,
    isRepPr,
    qualifyingSides,
  }
}
