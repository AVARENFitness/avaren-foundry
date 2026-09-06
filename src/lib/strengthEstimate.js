import {
  externalLoadAmount,
  isComparableForLoadPr,
  LOAD_TYPES,
  resolveSetLoadType,
} from './exerciseLoad'
import { expandUnilateralPerformances } from './unilateralExercise'

/** Existing AVAREN Epley-style formula, with a hard credibility cap. */
export const MAX_CREDIBLE_REPS_FOR_ESTIMATE = 12
export const MATERIAL_DECLINE_RATIO = 0.93
export const DECLINE_SESSION_THRESHOLD = 3
export const DECLINE_BLEND = 0.4

export const EVIDENCE_QUALITY = {
  REJECT: 'reject',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
}

const round1 = (value) => Math.round(Number(value) * 10) / 10

export const rpeToRir = (rpe) => {
  const numeric = Number(rpe)
  if (!Number.isFinite(numeric)) return 0
  if (numeric < 6 || numeric > 10) return 0
  return Math.max(0, 10 - numeric)
}

/**
 * Deterministic estimated 1RM from load + reps (+ optional RPE).
 * Caps effective reps so high-rep sets cannot invent absurd maxes.
 */
export const estimateOneRepMaxFromPerformance = ({
  weight,
  reps,
  rpe = null,
} = {}) => {
  const load = Number(weight)
  const rawReps = Number(reps)
  if (!Number.isFinite(load) || load <= 0) return 0
  if (!Number.isFinite(rawReps) || rawReps <= 0) return 0

  if (rawReps > MAX_CREDIBLE_REPS_FOR_ESTIMATE) return 0

  const rir = rpeToRir(rpe)
  const effectiveReps = Math.min(
    MAX_CREDIBLE_REPS_FOR_ESTIMATE,
    rawReps + rir,
  )

  if (effectiveReps <= 1) return round1(load)
  return round1(load * (1 + effectiveReps / 30))
}

/** Backward-compatible alias used across the app. */
export const estimatedOneRepMax = (weight, reps, rpe = null) =>
  estimateOneRepMaxFromPerformance({ weight, reps, rpe })

export const classifyEvidenceQuality = ({
  reps,
  setType = null,
  loadType = LOAD_TYPES.EXTERNAL,
} = {}) => {
  if (
    loadType !== LOAD_TYPES.EXTERNAL &&
    loadType !== LOAD_TYPES.BODYWEIGHT_ADDED
  ) {
    return EVIDENCE_QUALITY.REJECT
  }

  if (String(setType || '').toLowerCase() === 'warm-up') {
    return EVIDENCE_QUALITY.REJECT
  }

  const numericReps = Number(reps)
  if (!Number.isFinite(numericReps) || numericReps <= 0) {
    return EVIDENCE_QUALITY.REJECT
  }
  if (numericReps > MAX_CREDIBLE_REPS_FOR_ESTIMATE) {
    return EVIDENCE_QUALITY.REJECT
  }
  if (numericReps <= 3) return EVIDENCE_QUALITY.HIGH
  if (numericReps <= 8) return EVIDENCE_QUALITY.MEDIUM
  return EVIDENCE_QUALITY.LOW
}

export const collectSetStrengthPerformances = (set = {}, exerciseName = null) => {
  const name = exerciseName ?? set.exercise ?? ''
  const loadType = resolveSetLoadType(set, set.loadType)
  if (!isComparableForLoadPr({ loadType })) return []

  return expandUnilateralPerformances(set, name)
    .map((performance) => {
      const weight = externalLoadAmount(
        { ...set, weight: performance.weight, loadType },
        loadType,
      )
      const reps = Number(performance.reps || 0)
      const quality = classifyEvidenceQuality({
        reps,
        setType: set.type,
        loadType,
      })
      if (quality === EVIDENCE_QUALITY.REJECT) return null
      if (!Number.isFinite(weight) || weight <= 0) return null

      const estimate = estimateOneRepMaxFromPerformance({
        weight,
        reps,
        rpe: set.rpe ?? null,
      })
      if (estimate <= 0) return null

      return {
        side: performance.side,
        weight,
        reps,
        rpe: set.rpe ?? null,
        quality,
        estimate,
        isSingle: reps === 1,
      }
    })
    .filter(Boolean)
}

const median = (values = []) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

/**
 * Canonical exercise strength model.
 * - provenBest / allTimeBestEstimate never decrease from lighter sessions
 * - currentEstimate rises quickly on strong evidence
 * - currentEstimate lowers only after repeated credible lower sessions
 */
export const resolveExerciseStrength = (history = [], exerciseName = '') => {
  const name = String(exerciseName || '').trim()
  if (!name) {
    return {
      exercise: '',
      provenBest: 0,
      provenSingleBest: 0,
      allTimeBestEstimate: 0,
      currentEstimate: 0,
      sessions: [],
    }
  }

  const chronological = [...(history ?? [])].sort((a, b) => {
    const aKey = a?.finishedAt ?? a?.date ?? ''
    const bKey = b?.finishedAt ?? b?.date ?? ''
    return String(aKey).localeCompare(String(bKey))
  })

  let provenSingleBest = 0
  let allTimeBestEstimate = 0
  let currentEstimate = 0
  const declineBuffer = []
  const sessions = []

  chronological.forEach((session) => {
    const sets = (session?.sets ?? []).filter(
      (set) => set?.exercise === name,
    )
    if (!sets.length) return

    const performances = sets.flatMap((set) =>
      collectSetStrengthPerformances(set, name),
    )
    if (!performances.length) return

    performances.forEach((item) => {
      if (item.isSingle) {
        provenSingleBest = Math.max(provenSingleBest, item.weight)
      }
      allTimeBestEstimate = Math.max(allTimeBestEstimate, item.estimate)
    })

    const informative = performances.filter(
      (item) =>
        item.quality === EVIDENCE_QUALITY.HIGH ||
        item.quality === EVIDENCE_QUALITY.MEDIUM,
    )
    const sessionPeak = Math.max(
      0,
      ...informative.map((item) => item.estimate),
      // Allow a high-quality low-rep estimate even if only LOW exists? Prefer informative.
    )

    // Low-quality peaks may still raise all-time/proven but should not force declines.
    const anyPeak = Math.max(0, ...performances.map((item) => item.estimate))
    const peakForRaise = Math.max(sessionPeak, anyPeak > currentEstimate ? anyPeak : 0)

    if (peakForRaise > currentEstimate) {
      currentEstimate = peakForRaise
      declineBuffer.length = 0
    } else if (
      sessionPeak > 0 &&
      currentEstimate > 0 &&
      sessionPeak <= currentEstimate * MATERIAL_DECLINE_RATIO
    ) {
      declineBuffer.push(sessionPeak)
      while (declineBuffer.length > DECLINE_SESSION_THRESHOLD) {
        declineBuffer.shift()
      }

      if (declineBuffer.length >= DECLINE_SESSION_THRESHOLD) {
        const target = median(declineBuffer)
        if (target > 0 && target < currentEstimate) {
          currentEstimate = round1(
            currentEstimate - (currentEstimate - target) * DECLINE_BLEND,
          )
        }
        // Keep the most recent decline signal so reduction stays gradual.
        declineBuffer.splice(0, Math.max(0, declineBuffer.length - 1))
      }
    }

    const provenBest = Math.max(provenSingleBest, allTimeBestEstimate)

    sessions.push({
      id: session.id,
      date:
        session.date ||
        (session.finishedAt ? String(session.finishedAt).slice(0, 10) : ''),
      workout: session.name,
      sessionPeakEstimate: round1(Math.max(sessionPeak, anyPeak)),
      currentEstimateAfter: round1(currentEstimate),
      provenBestAfter: round1(provenBest),
    })
  })

  const provenBest = Math.max(provenSingleBest, allTimeBestEstimate)

  return {
    exercise: name,
    provenBest: round1(provenBest),
    provenSingleBest: round1(provenSingleBest),
    allTimeBestEstimate: round1(allTimeBestEstimate),
    currentEstimate: round1(currentEstimate),
    sessions,
  }
}

/**
 * Selective RPE: only for informative strength evidence near best / PR territory.
 */
export const shouldPromptForRpe = ({
  set = {},
  exerciseName = '',
  history = [],
  alreadyPromptedForExercise = false,
} = {}) => {
  if (alreadyPromptedForExercise) return false

  const loadType = resolveSetLoadType(set, set.loadType)
  if (!isComparableForLoadPr({ loadType })) return false
  if (String(set.type || '').toLowerCase() === 'warm-up') return false
  if (set.rpe != null && set.rpe !== '') return false

  const performances = collectSetStrengthPerformances(
    { ...set, exercise: exerciseName || set.exercise },
    exerciseName || set.exercise,
  )
  if (!performances.length) return false

  const strength = resolveExerciseStrength(history, exerciseName || set.exercise)
  const best = Math.max(strength.provenBest, strength.currentEstimate, 0)

  return performances.some((item) => {
    if (
      item.quality === EVIDENCE_QUALITY.REJECT ||
      item.quality === EVIDENCE_QUALITY.LOW
    ) {
      return false
    }

    // No established strength yet: only ask on high-quality low-rep work.
    if (best <= 0) return item.quality === EVIDENCE_QUALITY.HIGH

    // Heavy singles/doubles/triples near established strength.
    if (item.reps <= 3 && item.weight >= best * 0.85) return true

    // New weight territory or estimate near/above current best.
    if (item.weight >= best * 0.9) return true
    if (item.estimate >= best * 0.95) return true
    return false
  })
}

export const estimateSetOneRepMax = (set = {}, exerciseName = null) => {
  const performances = collectSetStrengthPerformances(set, exerciseName)
  if (!performances.length) return 0
  return Math.max(0, ...performances.map((item) => item.estimate))
}
