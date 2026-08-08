import {
  canAccessCoachHub,
} from '../../hooks/useCoachAccess'
import {
  isCoachAccount,
} from '../../config/coachAccess'

export const AVA_ROLE_SOURCES = {
  PRIMARY_EMAIL: 'primary-email',
  RPC_COACH: 'rpc-coach',
  ATHLETE: 'athlete',
}

/**
 * Canonical AVA role — same coach gate as Coach Hub entry.
 * Does not infer from UI visibility or model output.
 */
export function resolveAvaRole({
  session = null,
  coachAuthorized = false,
} = {}) {
  const coachAccess = canAccessCoachHub(session, coachAuthorized)
  let source = AVA_ROLE_SOURCES.ATHLETE

  if (isCoachAccount(session)) {
    source = AVA_ROLE_SOURCES.PRIMARY_EMAIL
  } else if (coachAuthorized) {
    source = AVA_ROLE_SOURCES.RPC_COACH
  }

  return {
    role: coachAccess ? 'coach' : 'athlete',
    resolvedRole: coachAccess ? 'coach' : 'athlete',
    coachAccess,
    source,
  }
}

export function logAvaRoleDiagnostic(roleState = {}) {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-role]',
    JSON.stringify({
      role: roleState.role ?? roleState.resolvedRole ?? 'athlete',
      resolvedRole: roleState.resolvedRole ?? roleState.role ?? 'athlete',
      coachAccess: Boolean(roleState.coachAccess),
      source: roleState.source ?? AVA_ROLE_SOURCES.ATHLETE,
    }),
  )
}

export function buildBaseCoachAvaContext({
  session = null,
  coachAuthorized = false,
  isCoachMode = false,
  rosterContext = {},
} = {}) {
  const { coachAccess, source } = resolveAvaRole({ session, coachAuthorized })

  return {
    isCoachMode: Boolean(isCoachMode),
    authorized: coachAccess,
    coachAccess,
    roleSource: source,
    clients: rosterContext.clients ?? [],
    rosterEntries: rosterContext.rosterEntries ?? [],
    portfolio: rosterContext.portfolio ?? null,
    assignments: rosterContext.assignments ?? [],
    athleteStatesById: rosterContext.athleteStatesById ?? {},
    weeklyReviewsByAthleteId: rosterContext.weeklyReviewsByAthleteId ?? {},
    coachScreen: rosterContext.coachScreen ?? 'clients',
    selectedClient: rosterContext.selectedClient ?? null,
    selectedClientId: rosterContext.selectedClientId ?? null,
    weeklyReviewOpen: Boolean(rosterContext.weeklyReviewOpen),
    profileOpen: Boolean(rosterContext.profileOpen),
    portfolioLoading: Boolean(rosterContext.portfolioLoading),
    portfolioError: rosterContext.portfolioError ?? '',
  }
}
