import { resolveAvaRole } from './coach/avaCoachRole'
import { COACH_PORTFOLIO_STATUS } from '../lib/coachPortfolioService'

export const AVA_USER_ROLE = {
  COACH: 'coach',
  ATHLETE: 'athlete',
}

export const ATHLETE_AVA_CONTEXT_FALLBACK =
  "I can't load your full training context right now, but I can still help with general questions."

export const COACH_AVA_FALLBACK =
  'I can help with your clients, reviews, assignments, or who needs attention.'

export const COACH_AVA_PARTIAL_FALLBACK =
  "I can still help with your clients, reviews, assignments, and check-ins, but some performance data isn't available right now."

export const buildAvaRuntimeContext = ({
  session = null,
  coachAuthorized = false,
  coachContext = null,
} = {}) => {
  const roleState = resolveAvaRole({ session, coachAuthorized })
  const coachMode = Boolean(roleState.coachAccess)
  const athleteMode = !coachMode

  return {
    userRole: coachMode ? AVA_USER_ROLE.COACH : AVA_USER_ROLE.ATHLETE,
    coachMode,
    athleteMode,
    coachAccess: coachMode,
    authorizedCoachClientCount: coachContext?.clients?.length ?? 0,
    activeClientReferent: session?.activeCoachContext
      ? {
          athleteId: session.activeCoachContext.athleteId ?? null,
          clientName: session.activeCoachContext.clientName ?? null,
        }
      : null,
    roleSource: roleState.source,
  }
}

export const isCoachAvaAccess = ({ role = 'athlete', coachContext = null } = {}) =>
  role === AVA_USER_ROLE.COACH ||
  Boolean(coachContext?.coachAccess ?? coachContext?.authorized)

export const buildCoachAvaOpeningMessage = (coachContext = {}) => {
  const status = coachContext.portfolioStatus ?? COACH_PORTFOLIO_STATUS.IDLE
  const count = coachContext.clients?.length ?? 0

  if (status === COACH_PORTFOLIO_STATUS.ERROR) {
    return COACH_AVA_PARTIAL_FALLBACK
  }

  if (
    status === COACH_PORTFOLIO_STATUS.LOADING ||
    coachContext.portfolioLoading
  ) {
    return 'Loading your client roster…'
  }

  if (count === 0 && status === COACH_PORTFOLIO_STATUS.IDLE) {
    return 'Your coach workspace is ready. Connect clients in Coach Hub, then ask who needs attention or request a client update.'
  }

  if (status === COACH_PORTFOLIO_STATUS.PARTIAL) {
    return `I have ${count} client${count === 1 ? '' : 's'} on your roster. Some performance data is still loading — ask about check-ins, reviews, or who needs attention.`
  }

  if (count > 0) {
    return `I have ${count} client${count === 1 ? '' : 's'} on your roster. Ask who needs attention, who hasn't checked in, or say "give me an update on [client]."`
  }

  return COACH_AVA_FALLBACK
}

export const buildCoachSuggestedPrompts = () => [
  'Who needs my attention today?',
  "Who hasn't checked in?",
  'Show me my client list',
]

export const buildCoachAvaFallbackMessage = (coachContext = {}) => {
  const status = coachContext.portfolioStatus ?? COACH_PORTFOLIO_STATUS.IDLE

  if (
    status === COACH_PORTFOLIO_STATUS.ERROR ||
    status === COACH_PORTFOLIO_STATUS.PARTIAL
  ) {
    return COACH_AVA_PARTIAL_FALLBACK
  }

  return COACH_AVA_FALLBACK
}

export const isAthleteAvaFallbackMessage = (message = '') =>
  /I can help with .*readiness, recovery, or nutrition/i.test(String(message ?? '')) ||
  String(message ?? '').includes(ATHLETE_AVA_CONTEXT_FALLBACK)

export const preserveCoachSessionContext = (session = null) => {
  if (!session?.activeCoachContext) return null
  return { ...session.activeCoachContext }
}

export const restoreCoachSessionContext = (session = null, preserved = null) => {
  if (!session || !preserved) return session
  session.activeCoachContext = preserved
  return session
}
