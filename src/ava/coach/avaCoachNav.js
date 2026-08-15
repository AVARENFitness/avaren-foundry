import { AVA_ACTION_IDS } from '../actions/avaActionTypes'

export const COACH_HUB_DESTINATIONS = {
  HUB: 'coach-hub',
  CLIENTS: 'coach-clients',
}

export const logAvaNavDiagnostic = ({
  actionId = null,
  target = null,
  beforeView = null,
  afterView = null,
  sheetClosed = null,
  verified = null,
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-nav]',
    JSON.stringify({
      actionId,
      target,
      beforeView,
      afterView,
      sheetClosed,
      verified,
    }),
  )
}

export const describeCoachView = (snapshot = {}) => {
  if (!snapshot?.coachHub) return 'home'
  if (snapshot.profileOpen && snapshot.selectedClientId) return 'coach-client-profile'
  if (snapshot.weeklyReviewOpen && snapshot.selectedClientId) {
    return 'coach-weekly-review'
  }
  if (snapshot.coachScreen === 'clients') return 'coach-clients'
  if (snapshot.coachScreen === 'today') return 'coach-today'
  return `coach-${snapshot.coachScreen ?? 'hub'}`
}

export const isCoachClientsListVerified = (snapshot = {}) =>
  Boolean(snapshot.coachHub && snapshot.coachScreen === 'clients' && !snapshot.profileOpen && !snapshot.weeklyReviewOpen)

export const coachNavigationTargetForAction = (actionId, meta = {}) => {
  if (actionId === AVA_ACTION_IDS.OPEN_COACH_HUB) {
    return meta.destination === COACH_HUB_DESTINATIONS.CLIENTS ||
      meta.focus === 'clients'
      ? COACH_HUB_DESTINATIONS.CLIENTS
      : COACH_HUB_DESTINATIONS.CLIENTS
  }
  return COACH_HUB_DESTINATIONS.HUB
}
