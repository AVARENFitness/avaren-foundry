import { LOAD_TYPES, resolveSetLoadType } from './exerciseLoad'
import { sessionLoadVolume } from './workoutMetrics'

export const resolveSessionVolumeDisplay = (session = {}) => {
  const sets = session?.sets ?? []
  const loadVolume = sessionLoadVolume(session)

  const hasExternalLoadSets = sets.some((set) => {
    const loadType = resolveSetLoadType(set, set.loadType)
    return (
      loadType === LOAD_TYPES.EXTERNAL ||
      loadType === LOAD_TYPES.BODYWEIGHT_ADDED
    )
  })

  const hasBodyweightSets = sets.some(
    (set) => resolveSetLoadType(set, set.loadType) === LOAD_TYPES.BODYWEIGHT,
  )
  const hasAssistedSets = sets.some(
    (set) => resolveSetLoadType(set, set.loadType) === LOAD_TYPES.ASSISTED,
  )

  if (loadVolume > 0) {
    return {
      show: true,
      label: 'Load volume',
      value: Math.round(loadVolume),
      suffix: 'lb',
      hint:
        hasBodyweightSets || hasAssistedSets
          ? 'External load only. Bodyweight work is tracked by sets and reps.'
          : null,
    }
  }

  if ((hasBodyweightSets || hasAssistedSets) && !hasExternalLoadSets) {
    return { show: false }
  }

  return { show: false }
}
