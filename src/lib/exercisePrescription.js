export const normalizeRepTarget = (value) => {
  if (value == null || value === '') return null

  if (typeof value === 'object' && !Array.isArray(value)) {
    const min = Number(value.min)
    const max = Number(value.max ?? value.min)
    if (!Number.isFinite(min) || min <= 0) return null
    return {
      min,
      max: Number.isFinite(max) && max > 0 ? max : min,
    }
  }

  const text = String(value).trim()
  if (!text) return null

  const rangeMatch = text.match(/^(\d+)\s*[-–—]\s*(\d+)$/)
  if (rangeMatch) {
    const min = Number(rangeMatch[1])
    const max = Number(rangeMatch[2])
    if (min > 0 && max >= min) return { min, max }
  }

  const exact = Number(text)
  if (Number.isFinite(exact) && exact > 0) {
    return { min: exact, max: exact }
  }

  return null
}

export const normalizePrescription = (exercise = {}) => {
  if (exercise.prescription?.sets != null) {
    const sets = Number(exercise.prescription.sets)
    const reps = normalizeRepTarget(exercise.prescription.reps)
    return {
      sets: Number.isFinite(sets) && sets > 0 ? sets : 3,
      reps,
    }
  }

  const sets = Number(exercise.sets)
  const reps = normalizeRepTarget(exercise.reps)

  return {
    sets: Number.isFinite(sets) && sets > 0 ? sets : 3,
    reps,
  }
}

export const prescribedSetCount = (prescription = {}) => {
  const sets = Number(prescription?.sets)
  return Number.isFinite(sets) && sets > 0 ? sets : 3
}

export const formatRepTarget = (prescription = {}) => {
  const reps = normalizeRepTarget(prescription.reps)
  if (!reps) return null

  if (reps.min === reps.max) return `${reps.min} reps`
  return `${reps.min}–${reps.max} reps`
}

export const formatPrescriptionDisplay = (prescription = {}) => {
  const sets = prescribedSetCount(prescription)
  const repLabel = formatRepTarget(prescription)

  if (repLabel) return `${sets} sets · ${repLabel}`
  return `${sets} sets`
}

export const formatPrescriptionForCoachPayload = (exercise = {}) => {
  const prescription = normalizePrescription(exercise)
  const repsLabel = formatRepTarget(prescription)

  return {
    ...exercise,
    sets: prescription.sets,
    prescription,
    reps: repsLabel
      ? repsLabel.replace(' reps', '').replace(' rep', '')
      : exercise.reps ?? '',
  }
}

export const gymModeSetLabel = (setIndex, prescription = {}) => {
  const total = prescribedSetCount(prescription)
  const repTarget = formatRepTarget(prescription)
  const setNumber = setIndex + 1

  const parts = [`SET ${setNumber} OF ${total}`]
  if (repTarget) parts.push(`Target: ${repTarget}`)
  return parts.join(' · ')
}
