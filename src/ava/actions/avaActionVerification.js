import { AVA_ACTION_IDS } from './avaActionTypes'
import { getDestinationForAction } from './avaActionReferent'

export const verifyAvaAction = ({
  actionId,
  runtime,
  context = {},
} = {}) => {
  const snapshot = runtime?.getSnapshot?.() ?? {}
  const destination = getDestinationForAction(actionId)

  switch (actionId) {
    case AVA_ACTION_IDS.START_TODAYS_WORKOUT:
    case AVA_ACTION_IDS.OPEN_WORKOUT: {
      const active = Boolean(snapshot.activeWorkout)
      const onGym = snapshot.screen === 'gym'
      if (active || onGym) {
        return {
          ok: true,
          alreadyActive: active,
          destination: 'gym',
        }
      }
      return { ok: false, reason: 'workout-not-active', destination: 'gym' }
    }
    case AVA_ACTION_IDS.OPEN_READINESS:
      if (snapshot.showReadinessCheckIn) {
        return { ok: true, destination: 'readiness' }
      }
      return { ok: false, reason: 'readiness-not-open', destination: 'readiness' }
    case AVA_ACTION_IDS.OPEN_NUTRITION:
      if (snapshot.screen === 'nutrition') {
        return { ok: true, destination: 'nutrition' }
      }
      return { ok: false, reason: 'nutrition-not-open', destination: 'nutrition' }
    case AVA_ACTION_IDS.OPEN_RECOVERY:
    case AVA_ACTION_IDS.START_RECOVERY_FLOW:
      if (snapshot.screen === 'mobility') {
        return { ok: true, destination: 'mobility' }
      }
      return { ok: false, reason: 'recovery-not-open', destination: 'mobility' }
    default:
      return { ok: false, reason: 'unknown-action', destination }
  }
}

const wait = (ms = 50) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export const verifyAvaActionAsync = async ({
  actionId,
  runtime,
  context = {},
  maxWaitMs = 650,
  intervalMs = 50,
} = {}) => {
  const deadline = Date.now() + maxWaitMs

  while (Date.now() <= deadline) {
    const result = verifyAvaAction({ actionId, runtime, context })
    if (result.ok) {
      return result
    }
    await wait(intervalMs)
  }

  return verifyAvaAction({ actionId, runtime, context })
}
