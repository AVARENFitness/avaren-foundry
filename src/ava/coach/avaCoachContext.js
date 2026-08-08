import { AVA_ACTION_IDS } from '../actions/avaActionTypes'

export const COACH_REFERENT_TYPES = {
  CLIENT: 'client',
  REVIEW: 'review',
  INTELLIGENCE: 'intelligence',
}

export const createActiveCoachContext = ({
  clientId = null,
  clientName = null,
  athleteId = null,
  source = 'ava',
  referentType = COACH_REFERENT_TYPES.CLIENT,
} = {}) => ({
  clientId: clientId ?? athleteId ?? null,
  athleteId: athleteId ?? clientId ?? null,
  clientName: clientName ?? null,
  referentType,
  source,
  createdAt: new Date().toISOString(),
})

export const setSessionActiveCoachContext = (session, context) => {
  if (!session) return null
  if (!context?.athleteId && !context?.clientId) {
    session.activeCoachContext = null
    return null
  }
  session.activeCoachContext = createActiveCoachContext(context)
  return session.activeCoachContext
}

export const clearSessionActiveCoachContext = (session) => {
  if (!session) return
  session.activeCoachContext = null
}

export const getAuthorizedClient = (coachContext = {}, athleteId = null) => {
  const id = String(athleteId ?? '').trim()
  if (!id) return null
  return (coachContext.clients ?? []).find(
    (client) => String(client.athlete_id) === id,
  ) ?? null
}

export const assertAuthorizedClient = (coachContext = {}, athleteId = null) => {
  const client = getAuthorizedClient(coachContext, athleteId)
  if (!client) {
    return {
      ok: false,
      message: "That client isn't in your authorized roster.",
    }
  }
  return { ok: true, client }
}

export const resolveCoachActionClient = ({
  coachContext = {},
  session = null,
  explicitAthleteId = null,
  useActiveReferent = true,
} = {}) => {
  const athleteId =
    explicitAthleteId ??
    (useActiveReferent
      ? session?.activeCoachContext?.athleteId ??
        session?.activeCoachContext?.clientId
      : null)

  return assertAuthorizedClient(coachContext, athleteId)
}

export const coachDestinationSnapshot = (coachContext = {}) => ({
  coachHub: Boolean(coachContext.isCoachMode),
  coachScreen: coachContext.coachScreen ?? 'clients',
  selectedClientId:
    coachContext.selectedClient?.athlete_id ??
    coachContext.selectedClientId ??
    null,
  weeklyReviewOpen: Boolean(coachContext.weeklyReviewOpen),
  profileOpen: Boolean(coachContext.profileOpen),
})

export const coachActionRequiresClient = (actionId) =>
  [
    AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
    AVA_ACTION_IDS.OPEN_CLIENT_INTELLIGENCE,
    AVA_ACTION_IDS.CLIENT_SUMMARY,
  ].includes(actionId)
