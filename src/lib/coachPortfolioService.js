import { buildCoachPortfolioIntelligence } from './clientIntelligence'
import { coachBackend } from './coachBackend'
import {
  buildCoachPassAvaContext,
  normalizePassBalanceViewRow,
  summarizeClientPasses,
} from './coachPass'
import { weeklyCheckInBackend } from './weeklyCheckInBackend'
import { normalizeWeeklyReview, getCoachWeekRange } from './weeklyReview'
import { isOpenFollowUp, normalizeCoachFollowUp } from './coachFollowUp'

export const COACH_PORTFOLIO_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  PARTIAL: 'partial',
  ERROR: 'error',
}

export const COACH_PORTFOLIO_DOMAINS = {
  ROSTER: 'roster',
  CHECK_IN: 'checkIn',
  RECOVERY: 'recovery',
  TRAINING: 'training',
  NUTRITION: 'nutrition',
  REVIEWS: 'reviews',
}

const CACHE_TTL_MS = 60_000

const cache = {
  key: null,
  loadedAt: 0,
  bundle: null,
  inflight: null,
}

const normalizeErrorMessage = (error) =>
  error?.message ?? 'Could not load coach portfolio data.'

export const logAvaCoachDataDiagnostic = ({
  status = COACH_PORTFOLIO_STATUS.IDLE,
  source = 'cache',
  authorizedClientCount = 0,
  requiredDomains = [],
  missingDomains = [],
  cacheHit = false,
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-coach-data]',
    JSON.stringify({
      status,
      source,
      authorizedClientCount,
      requiredDomains,
      missingDomains,
      cacheHit,
    }),
  )
}

const athleteIdsKey = (athleteIds = []) =>
  [...new Set(athleteIds.filter(Boolean))].sort().join('|')

const computeMissingDomains = ({
  clients = [],
  athleteStatesById = {},
  nutritionByAthleteId = {},
  weeklyReviewsByAthleteId = {},
  weeklyCheckInsByAthleteId = {},
} = {}) => {
  const missing = new Set()
  if (!clients.length) {
    missing.add(COACH_PORTFOLIO_DOMAINS.ROSTER)
    return [...missing]
  }

  let missingRecovery = 0
  clients.forEach((client) => {
    const athleteId = client.athlete_id
    const state = athleteStatesById[athleteId]
    if (!state) {
      missingRecovery += 1
      return
    }
    if (!state.readiness) {
      missingRecovery += 1
    }
  })
  if (missingRecovery === clients.length) {
    missing.add(COACH_PORTFOLIO_DOMAINS.RECOVERY)
  }
  if (!Object.keys(weeklyReviewsByAthleteId).length && clients.length) {
    missing.add(COACH_PORTFOLIO_DOMAINS.REVIEWS)
  }
  if (
    clients.length &&
    !Object.values(nutritionByAthleteId).some((entry) => entry?.profile?.coach_access)
  ) {
    missing.add(COACH_PORTFOLIO_DOMAINS.NUTRITION)
  }

  return [...missing]
}

export const buildCoachPortfolioBundle = ({
  clients = [],
  assignments = [],
  athleteStatesById = {},
  nutritionByAthleteId = {},
  weeklyReviewsByAthleteId = {},
  weeklyCheckInsByAthleteId = {},
  coachFollowUpsByAthleteId = {},
  passAvaContextByAthleteId = {},
  status = COACH_PORTFOLIO_STATUS.READY,
  error = '',
  source = 'network',
  cacheHit = false,
} = {}) => {
  const portfolio = buildCoachPortfolioIntelligence({
    clients,
    assignments,
    athleteStatesById,
    nutritionByAthleteId,
    weeklyReviewsByAthleteId,
    weeklyCheckInsByAthleteId,
  })

  const missingDomains = computeMissingDomains({
    clients,
    athleteStatesById,
    nutritionByAthleteId,
    weeklyReviewsByAthleteId,
    weeklyCheckInsByAthleteId,
  })

  const resolvedStatus =
    status === COACH_PORTFOLIO_STATUS.READY && missingDomains.length
      ? COACH_PORTFOLIO_STATUS.PARTIAL
      : status

  const bundle = {
    status: resolvedStatus,
    clients,
    assignments,
    athleteStatesById,
    nutritionByAthleteId,
    weeklyReviewsByAthleteId,
    weeklyCheckInsByAthleteId,
    coachFollowUpsByAthleteId,
    passAvaContextByAthleteId,
    portfolio,
    rosterEntries: portfolio.rosterEntries ?? [],
    loadedAt: Date.now(),
    missingDomains,
    portfolioError: error,
    source,
    cacheHit,
  }

  logAvaCoachDataDiagnostic({
    status: bundle.status,
    source,
    authorizedClientCount: clients.length,
    requiredDomains: [],
    missingDomains: bundle.missingDomains,
    cacheHit,
  })

  return bundle
}

export const mergeCoachPortfolioBundle = (coachContext = {}, bundle = {}) => ({
  ...(coachContext ?? {}),
  clients: bundle.clients ?? coachContext.clients ?? [],
  assignments: bundle.assignments ?? coachContext.assignments ?? [],
  athleteStatesById:
    bundle.athleteStatesById ?? coachContext.athleteStatesById ?? {},
  nutritionByAthleteId:
    bundle.nutritionByAthleteId ?? coachContext.nutritionByAthleteId ?? {},
  weeklyReviewsByAthleteId:
    bundle.weeklyReviewsByAthleteId ??
    coachContext.weeklyReviewsByAthleteId ??
    {},
  weeklyCheckInsByAthleteId:
    bundle.weeklyCheckInsByAthleteId ??
    coachContext.weeklyCheckInsByAthleteId ??
    {},
  coachFollowUpsByAthleteId:
    bundle.coachFollowUpsByAthleteId ??
    coachContext.coachFollowUpsByAthleteId ??
    {},
  portfolio: bundle.portfolio ?? coachContext.portfolio ?? null,
  rosterEntries:
    bundle.rosterEntries ??
    bundle.portfolio?.rosterEntries ??
    coachContext.rosterEntries ??
    [],
  portfolioStatus: bundle.status ?? coachContext.portfolioStatus ?? COACH_PORTFOLIO_STATUS.IDLE,
  portfolioLoadedAt: bundle.loadedAt ?? coachContext.portfolioLoadedAt ?? null,
  portfolioMissingDomains:
    bundle.missingDomains ?? coachContext.portfolioMissingDomains ?? [],
  portfolioError: bundle.portfolioError ?? coachContext.portfolioError ?? '',
  portfolioLoading: bundle.status === COACH_PORTFOLIO_STATUS.LOADING,
})

export const getRequiredDomainsForQuery = (queryType = null) => {
  switch (queryType) {
    case 'missing_checkin':
      return [COACH_PORTFOLIO_DOMAINS.ROSTER, COACH_PORTFOLIO_DOMAINS.CHECK_IN]
    case 'recovery':
      return [COACH_PORTFOLIO_DOMAINS.ROSTER, COACH_PORTFOLIO_DOMAINS.RECOVERY]
    case 'training':
      return [COACH_PORTFOLIO_DOMAINS.ROSTER, COACH_PORTFOLIO_DOMAINS.TRAINING]
    case 'nutrition':
      return [COACH_PORTFOLIO_DOMAINS.ROSTER, COACH_PORTFOLIO_DOMAINS.NUTRITION]
    case 'weekly_review':
      return [COACH_PORTFOLIO_DOMAINS.ROSTER, COACH_PORTFOLIO_DOMAINS.REVIEWS]
    case 'attention':
    default:
      return [
        COACH_PORTFOLIO_DOMAINS.ROSTER,
        COACH_PORTFOLIO_DOMAINS.CHECK_IN,
        COACH_PORTFOLIO_DOMAINS.RECOVERY,
        COACH_PORTFOLIO_DOMAINS.TRAINING,
        COACH_PORTFOLIO_DOMAINS.REVIEWS,
      ]
  }
}

export const portfolioBundleHasRequiredDomains = (
  bundle = {},
  requiredDomains = [],
) => {
  if (!bundle?.clients?.length) return false
  if (!requiredDomains.length) return true

  const missing = new Set(bundle.missingDomains ?? [])
  if (missing.has(COACH_PORTFOLIO_DOMAINS.ROSTER)) return false

  return requiredDomains.every((domain) => {
    if (domain === COACH_PORTFOLIO_DOMAINS.ROSTER) {
      return (bundle.rosterEntries?.length ?? 0) > 0
    }
    if (domain === COACH_PORTFOLIO_DOMAINS.NUTRITION) {
      return !missing.has(COACH_PORTFOLIO_DOMAINS.NUTRITION)
    }
    return (bundle.rosterEntries?.length ?? 0) > 0
  })
}

export const portfolioQueryLoadErrorMessage = (queryType = null) => {
  switch (queryType) {
    case 'missing_checkin':
      return "I couldn't load your client check-ins right now. Try again."
    case 'recovery':
      return "I couldn't load recovery data for your roster right now. Try again."
    case 'attention':
      return "I couldn't load your client activity right now. Try again."
    default:
      return "I couldn't load your coaching data right now. Try again."
  }
}

export const invalidateCoachPortfolioCache = () => {
  cache.key = null
  cache.loadedAt = 0
  cache.bundle = null
  cache.inflight = null
}

export const publishCoachPortfolioBundle = (bundle = {}) => {
  const athleteIds = (bundle.clients ?? []).map((client) => client.athlete_id)
  cache.key = athleteIdsKey(athleteIds)
  cache.loadedAt = Date.now()
  cache.bundle = bundle
}

const fetchPassContextsForClients = async (clients = []) => {
  const passAvaContextByBusinessClientId = Object.fromEntries(
    (
      await Promise.all(
        clients.map(async (client) => {
          const businessClientId =
            client.business_client_id ?? client.businessClientId ?? client.id
          if (!businessClientId) {
            return null
          }

          try {
            const rows = await coachBackend.listClientPassBalances(businessClientId)
            const passes = (rows ?? [])
              .map(normalizePassBalanceViewRow)
              .filter(Boolean)
            return [
              businessClientId,
              buildCoachPassAvaContext({
                client,
                passes,
                ledger: [],
                appointments: [],
              }),
            ]
          } catch {
            return [businessClientId, null]
          }
        }),
      )
    ).filter(Boolean),
  )

  const passAvaContextByAthleteId = Object.fromEntries(
    Object.entries(passAvaContextByBusinessClientId)
      .map(([, context]) => {
        const athleteId = context?.athleteId ?? null
        return athleteId ? [athleteId, context] : null
      })
      .filter(Boolean),
  )

  return { passAvaContextByAthleteId, passAvaContextByBusinessClientId }
}

const fetchPortfolioIntelligence = async (clients = []) => {
  const athleteIds = clients.map((client) => client.athlete_id).filter(Boolean)
  const passContexts = await fetchPassContextsForClients(clients)

  if (!athleteIds.length) {
    return {
      athleteStatesById: {},
      nutritionByAthleteId: {},
      weeklyReviewsByAthleteId: {},
      weeklyCheckInsByAthleteId: {},
      coachFollowUpsByAthleteId: {},
      ...passContexts,
    }
  }

  const weekStart = getCoachWeekRange().weekStart
  const [athleteStatesById, nutritionByAthleteId, reviews, weeklyCheckInsByAthleteId, coachFollowUps] =
    await Promise.all([
      coachBackend.listAthleteFoundryStates(athleteIds),
      coachBackend.listAthleteNutritionSnapshots(athleteIds),
      coachBackend.listCoachWeeklyReviews(),
      weeklyCheckInBackend.listCoachWeeklyCheckIns(athleteIds, weekStart),
      coachBackend.listCoachClientFollowUps({ status: 'open' }).catch(() => []),
    ])

  const weeklyReviewsByAthleteId = Object.fromEntries(
    (reviews ?? [])
      .map((row) => normalizeWeeklyReview(row))
      .filter(Boolean)
      .map((review) => [review.athleteId, review]),
  )

  const passAvaContextByBusinessClientId = passContexts.passAvaContextByBusinessClientId
  const passAvaContextByAthleteId = passContexts.passAvaContextByAthleteId

  const coachFollowUpsByAthleteId = Object.fromEntries(
    athleteIds.map((athleteId) => [
      athleteId,
      (coachFollowUps ?? [])
        .map(normalizeCoachFollowUp)
        .filter((item) => item.athleteId === athleteId && isOpenFollowUp(item)),
    ]),
  )

  return {
    athleteStatesById,
    nutritionByAthleteId,
    weeklyReviewsByAthleteId,
    weeklyCheckInsByAthleteId,
    coachFollowUpsByAthleteId,
    passAvaContextByAthleteId,
    passAvaContextByBusinessClientId,
  }
}

export async function loadCoachPortfolio({ force = false } = {}) {
  const now = Date.now()
  if (
    !force &&
    cache.bundle &&
    cache.loadedAt &&
    now - cache.loadedAt < CACHE_TTL_MS
  ) {
    return { ...cache.bundle, cacheHit: true, source: 'cache' }
  }

  if (cache.inflight && !force) {
    return cache.inflight
  }

  cache.inflight = (async () => {
    try {
      const [clients, assignments] = await Promise.all([
        coachBackend.listClientsWithIdentity(),
        coachBackend.listCoachAssignments(),
      ])
      const intelligence = await fetchPortfolioIntelligence(clients)
      const bundle = buildCoachPortfolioBundle({
        clients,
        assignments,
        ...intelligence,
        status: COACH_PORTFOLIO_STATUS.READY,
        source: 'network',
        cacheHit: false,
      })
      cache.key = athleteIdsKey(clients.map((client) => client.athlete_id))
      cache.loadedAt = Date.now()
      cache.bundle = bundle
      return bundle
    } catch (error) {
      const failed = buildCoachPortfolioBundle({
        clients: [],
        assignments: [],
        athleteStatesById: {},
        nutritionByAthleteId: {},
        weeklyReviewsByAthleteId: {},
        status: COACH_PORTFOLIO_STATUS.ERROR,
        error: normalizeErrorMessage(error),
        source: 'network',
        cacheHit: false,
      })
      throw Object.assign(error ?? new Error('coach-portfolio-load-failed'), {
        portfolioBundle: failed,
      })
    } finally {
      cache.inflight = null
    }
  })()

  return cache.inflight
}

export async function ensureCoachPortfolio({
  force = false,
  requiredDomains = [],
} = {}) {
  logAvaCoachDataDiagnostic({
    status: COACH_PORTFOLIO_STATUS.LOADING,
    source: force ? 'network' : 'ensure',
    requiredDomains,
  })

  try {
    const bundle = await loadCoachPortfolio({ force })
    const hasRequired = portfolioBundleHasRequiredDomains(bundle, requiredDomains)
    return {
      ...bundle,
      hasRequiredDomains: hasRequired,
    }
  } catch (error) {
    return {
      ...(error.portfolioBundle ??
        buildCoachPortfolioBundle({
          status: COACH_PORTFOLIO_STATUS.ERROR,
          error: normalizeErrorMessage(error),
          source: 'network',
        })),
      hasRequiredDomains: false,
      loadFailed: true,
    }
  }
}

export async function loadCoachPortfolioIntelligence({
  clients = [],
  assignments = [],
  force = false,
} = {}) {
  const athleteIds = clients.map((client) => client.athlete_id).filter(Boolean)
  const key = athleteIdsKey(athleteIds)
  const now = Date.now()

  if (
    !force &&
    cache.bundle &&
    cache.key === key &&
    cache.loadedAt &&
    now - cache.loadedAt < CACHE_TTL_MS &&
    cache.bundle.clients?.length === clients.length
  ) {
    return {
      athleteStatesById: cache.bundle.athleteStatesById,
      nutritionByAthleteId: cache.bundle.nutritionByAthleteId,
      weeklyReviewsByAthleteId: cache.bundle.weeklyReviewsByAthleteId,
      weeklyCheckInsByAthleteId: cache.bundle.weeklyCheckInsByAthleteId,
      passAvaContextByBusinessClientId:
        cache.bundle.passAvaContextByBusinessClientId ?? {},
      cacheHit: true,
    }
  }

  const intelligence = await fetchPortfolioIntelligence(clients)
  const bundle = buildCoachPortfolioBundle({
    clients,
    assignments,
    ...intelligence,
    status: COACH_PORTFOLIO_STATUS.READY,
    source: 'network',
    cacheHit: false,
  })
  publishCoachPortfolioBundle(bundle)
  return {
    ...intelligence,
    cacheHit: false,
    bundle,
  }
}

export const coachContextHasPortfolioData = (coachContext = {}) =>
  Boolean(
    (coachContext.portfolio?.rosterEntries?.length ?? 0) > 0 ||
      (coachContext.rosterEntries?.length ?? 0) > 0,
  )

export const getCoachPortfolioCacheSnapshot = () => ({
  loadedAt: cache.loadedAt,
  hasBundle: Boolean(cache.bundle),
  clientCount: cache.bundle?.clients?.length ?? 0,
})
