import { AVA_ACTION_IDS, isCoachAvaAction } from './avaActionTypes'
import { getDestinationForAction } from './avaActionReferent'
import { isCoachClientsListVerified } from '../coach/avaCoachNav'

export const verifyAvaAction = ({
  actionId,
  runtime,
  context = {},
} = {}) => {
  const snapshot = runtime?.getSnapshot?.() ?? {}
  const destination = getDestinationForAction(actionId)

  if (isCoachAvaAction(actionId)) {
    switch (actionId) {
      case AVA_ACTION_IDS.OPEN_COACH_HUB:
        if (isCoachClientsListVerified(snapshot)) {
          return {
            ok: true,
            destination: 'coach-clients',
            alreadyActive: true,
          }
        }
        if (snapshot.coachHub && snapshot.coachScreen === 'clients') {
          return { ok: true, destination: 'coach-clients' }
        }
        if (snapshot.coachHub) {
          return {
            ok: false,
            reason: 'coach-clients-not-active',
            destination: 'coach-clients',
          }
        }
        return {
          ok: false,
          reason: 'coach-hub-not-open',
          destination: 'coach-clients',
        }
      case AVA_ACTION_IDS.OPEN_CLIENT_PROFILE:
      case AVA_ACTION_IDS.OPEN_CLIENT_INTELLIGENCE:
        if (
          snapshot.coachHub &&
          String(snapshot.selectedClientId) ===
            String(context.athleteId ?? context.meta?.athleteId)
        ) {
          return { ok: true, destination: 'coach-client' }
        }
        return { ok: false, reason: 'client-not-open', destination: 'coach-client' }
      case AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS:
        if (snapshot.coachHub && snapshot.weeklyReviewOpen) {
          return { ok: true, destination: 'coach-weekly-review' }
        }
        if (
          snapshot.coachHub &&
          snapshot.coachScreen === 'clients' &&
          !context.athleteId &&
          !context.meta?.athleteId
        ) {
          return { ok: true, destination: 'coach-weekly-reviews' }
        }
        if (
          snapshot.coachHub &&
          snapshot.weeklyReviewOpen &&
          String(snapshot.selectedClientId) ===
            String(context.athleteId ?? context.meta?.athleteId)
        ) {
          return { ok: true, destination: 'coach-weekly-review' }
        }
        return {
          ok: false,
          reason: 'weekly-review-not-open',
          destination: 'coach-weekly-review',
        }
      default:
        return { ok: true, destination: 'coach-query' }
    }
  }

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
