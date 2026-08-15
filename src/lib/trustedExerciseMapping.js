import {
  formatCompletedSetDisplay,
  formatLegacyCompletedSetDisplay,
  loadTypeLabel,
  normalizeLoadType,
  resolveSetLoadType,
} from './exerciseLoad'
import {
  formatPrescriptionDisplay,
  normalizePrescription,
} from './exercisePrescription'

export const mapTrustedExercise = (item = {}) => {
  const prescription = normalizePrescription(item)
  const loadType = normalizeLoadType(item.loadType, item.name)

  return {
    name: item.name ?? item.exercise ?? 'Exercise',
    sets: prescription.sets,
    muscle: item.muscle ?? null,
    loadType,
    prescription,
    summary: [
      formatPrescriptionDisplay(prescription),
      loadType !== 'external' ? loadTypeLabel(loadType) : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

export const mapTrustedCompletedSet = (set = {}) => ({
  exercise: set.exercise ?? null,
  muscle: set.muscle ?? null,
  loadType: resolveSetLoadType(set, set.loadType),
  reps: Number(set.reps ?? 0) || null,
  display: set.loadType
    ? formatCompletedSetDisplay(set)
    : formatLegacyCompletedSetDisplay(set),
})

export const mapTrustedSessionSets = (session = {}, limit = 12) =>
  (session.sets ?? []).slice(0, limit).map(mapTrustedCompletedSet)
