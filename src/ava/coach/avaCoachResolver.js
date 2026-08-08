import {
  AVA_ACTION_IDS,
} from '../actions/avaActionTypes'
import { AVA_ACTION_SOURCE } from '../actions/avaActionTypes'
import { buildActionResolution } from '../actions/avaActionResolver'
import {
  buildCoachClientChoices,
  extractClientNameFromMessage,
  resolveCoachClientByName,
} from './avaCoachClientResolver'
export { isCoachClientNameCommand } from './avaCoachClientResolver'
import { resolveCoachActionClient } from './avaCoachContext'
import {
  buildClientSummaryFacts,
  formatClientSummaryMessage,
  runCoachQuery,
} from './avaCoachQueries'

const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ')

const COACH_HUB_PATTERNS = [
  /^open coach hub\.?$/,
  /^open my coach hub\.?$/,
  /^take me to coach hub\.?$/,
  /^take me to my clients\.?$/,
  /^show my clients\.?$/,
  /^show me my clients\.?$/,
  /^open my clients\.?$/,
  /^open clients\.?$/,
  /^client list\.?$/,
  /^show me coaching\.?$/,
  /^open coaching\.?$/,
]

export const isOpenCoachHubCommand = (message = '') =>
  matchesAny(normalize(message), COACH_HUB_PATTERNS)

export const isCoachClientListCommand = (message = '') =>
  isOpenCoachHubCommand(message)

const WEEKLY_REVIEW_PATTERNS = [
  /^open weekly reviews?\.?$/,
  /^show unfinished reviews?\.?$/,
  /^who do i still need to review\??$/,
]

const ATTENTION_PATTERNS = [
  /^who needs my attention(?: today)?\??$/,
  /^who needs attention(?: today)?\??$/,
  /^show clients needing attention\.?$/,
  /^show me clients i need to follow up with\.?$/,
]

const MISSING_CHECKIN_PATTERNS = [
  /^who hasn't checked in\??$/,
  /^who still owes me a check-?in\??$/,
  /^show missing check-?ins?\.?$/,
]

const RECOVERY_PATTERNS = [
  /^who is struggling with recovery\??$/,
  /^show clients with low recovery\.?$/,
  /^show recovery concerns?\.?$/,
]

const TRAINING_PATTERNS = [
  /^who hasn't trained\??$/,
  /^who is behind on training\??$/,
  /^show training concerns?\.?$/,
]

const NUTRITION_PATTERNS = [
  /^who hasn't logged nutrition\??$/,
  /^who is behind on protein\??$/,
  /^show nutrition concerns?\.?$/,
]

const COACH_REFERENT_PATTERNS = [
  /^(show me )?(her|his|their) (intelligence|profile|review)\.?$/,
  /^open (her|his|their) (review|profile|intelligence)\.?$/,
  /^show me (her|his|their) review\.?$/,
  /^what(?:'s| is) going on with this client\??$/,
]

const matchesAny = (text, patterns = []) =>
  patterns.some((pattern) => pattern.test(text))

export const isCoachReferentCommand = (message = '') =>
  matchesAny(normalize(message), COACH_REFERENT_PATTERNS)

export const isCoachPortfolioQueryCommand = (message = '') => {
  const text = normalize(message)
  return (
    matchesAny(text, ATTENTION_PATTERNS) ||
    matchesAny(text, MISSING_CHECKIN_PATTERNS) ||
    matchesAny(text, RECOVERY_PATTERNS) ||
    matchesAny(text, TRAINING_PATTERNS) ||
    matchesAny(text, NUTRITION_PATTERNS) ||
    matchesAny(text, WEEKLY_REVIEW_PATTERNS)
  )
}

const rosterEntryForAthlete = (coachContext = {}, athleteId = null) =>
  (coachContext.portfolio?.rosterEntries ?? coachContext.rosterEntries ?? []).find(
    (entry) => String(entry.client?.athlete_id) === String(athleteId),
  ) ?? null

const buildClientNavigationResolution = ({
  actionId,
  athleteId,
  clientName,
  executeImmediately = true,
  label = null,
} = {}) =>
  buildActionResolution({
    actionId,
    source: AVA_ACTION_SOURCE.DETERMINISTIC,
    executeImmediately,
    label: label ?? (clientName ? `Open ${clientName}` : 'Open client'),
    meta: { athleteId, clientName },
  })

export const resolveCoachClientCommand = (
  message = '',
  { coachContext = {}, session = null } = {},
) => {
  const nameQuery = extractClientNameFromMessage(message)
  if (!nameQuery) return null

  const resolution = resolveCoachClientByName(nameQuery, coachContext.clients ?? [])

  if (resolution.status === 'none') {
    return {
      kind: 'response',
      message: resolution.message,
    }
  }

  if (resolution.status === 'ambiguous') {
    return {
      kind: 'disambiguation',
      message: resolution.message,
      choices: buildCoachClientChoices(resolution.matches),
      pendingAction: {
        actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
        query: nameQuery,
      },
    }
  }

  const isSummary = /quick update|give me a quick update/.test(normalize(message))

  if (isSummary) {
    const entry = rosterEntryForAthlete(coachContext, resolution.athleteId)
    const facts = buildClientSummaryFacts({ entry, coachContext })
    return {
      kind: 'summary',
      message: formatClientSummaryMessage(facts),
      facts,
      athleteId: resolution.athleteId,
      clientName: resolution.clientName,
    }
  }

  return {
    kind: 'navigation',
    resolution: buildClientNavigationResolution({
      actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
      athleteId: resolution.athleteId,
      clientName: resolution.clientName,
    }),
  }
}

export const resolveCoachReferentCommand = (
  message = '',
  { coachContext = {}, session = null } = {},
) => {
  const text = normalize(message)
  if (!isCoachReferentCommand(text)) return null

  const auth = resolveCoachActionClient({ coachContext, session })
  if (!auth.ok) {
    return {
      kind: 'response',
      message: 'Which client should I use? Open a client first, or say their name.',
    }
  }

  const clientName =
    session?.activeCoachContext?.clientName ??
    auth.client?.athlete_email ??
    'Client'

  if (/review/.test(text)) {
    return {
      kind: 'navigation',
      resolution: buildClientNavigationResolution({
        actionId: AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
        athleteId: auth.client.athlete_id,
        clientName,
        label: `Open ${clientName}'s review`,
      }),
    }
  }

  if (/intelligence|going on/.test(text)) {
    return {
      kind: 'navigation',
      resolution: buildClientNavigationResolution({
        actionId: AVA_ACTION_IDS.OPEN_CLIENT_INTELLIGENCE,
        athleteId: auth.client.athlete_id,
        clientName,
        label: `Open ${clientName}'s intelligence`,
      }),
    }
  }

  return {
    kind: 'navigation',
    resolution: buildClientNavigationResolution({
      actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
      athleteId: auth.client.athlete_id,
      clientName,
    }),
  }
}

export const resolveCoachQueryCommand = (message = '', { coachContext = {} } = {}) => {
  const text = normalize(message)

  let actionId = null
  if (matchesAny(text, ATTENTION_PATTERNS)) {
    actionId = AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION
  } else if (matchesAny(text, MISSING_CHECKIN_PATTERNS)) {
    actionId = AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN
  } else if (matchesAny(text, RECOVERY_PATTERNS)) {
    actionId = AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS
  } else if (matchesAny(text, TRAINING_PATTERNS)) {
    actionId = AVA_ACTION_IDS.SHOW_TRAINING_CONCERNS
  } else if (matchesAny(text, NUTRITION_PATTERNS)) {
    actionId = AVA_ACTION_IDS.SHOW_NUTRITION_CONCERNS
  } else if (matchesAny(text, WEEKLY_REVIEW_PATTERNS)) {
    actionId = AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS
  }

  if (!actionId) return null

  const result = runCoachQuery(actionId, coachContext)
  return {
    kind: 'query',
    actionId,
    result,
  }
}

export const resolveCoachExplicitCommand = (
  message = '',
  context = {},
) => {
  const text = normalize(message)
  if (!text) return null

  if (matchesAny(text, COACH_HUB_PATTERNS)) {
    return {
      kind: 'navigation',
      resolution: buildActionResolution({
        actionId: AVA_ACTION_IDS.OPEN_COACH_HUB,
        source: AVA_ACTION_SOURCE.DETERMINISTIC,
        executeImmediately: true,
        label: 'Show clients',
        meta: { destination: 'coach-clients', focus: 'clients' },
      }),
    }
  }

  const referent = resolveCoachReferentCommand(message, context)
  if (referent) return referent

  const query = resolveCoachQueryCommand(message, context)
  if (query) return query

  const clientCommand = resolveCoachClientCommand(message, context)
  if (clientCommand) return clientCommand

  return null
}

export const resolveCoachDisambiguationSelection = (
  choice = null,
  { coachContext = {}, pendingAction = null } = {},
) => {
  const athleteId =
    choice?.meta?.athleteId ??
    choice?.meta?.clientId ??
    choice?.id ??
    null

  const auth = resolveCoachActionClient({
    coachContext,
    explicitAthleteId: athleteId,
    useActiveReferent: false,
  })

  if (!auth.ok) {
    return {
      kind: 'response',
      message: auth.message,
    }
  }

  const actionId = pendingAction?.actionId ?? AVA_ACTION_IDS.OPEN_CLIENT_PROFILE
  const clientName =
    choice?.name ??
    choice?.label ??
    auth.client?.athlete_email ??
    'Client'

  return {
    kind: 'navigation',
    resolution: buildClientNavigationResolution({
      actionId,
      athleteId: auth.client.athlete_id,
      clientName,
    }),
  }
}

export const resolveCoachModelAction = (
  suggestedAction = null,
  { coachContext = {}, session = null, role = 'coach' } = {},
) => {
  if (role !== 'coach') {
    return {
      rejected: true,
      message: "That action isn't available here.",
    }
  }

  const actionId = String(
    suggestedAction?.id ??
      suggestedAction?.actionId ??
      suggestedAction?.type ??
      '',
  ).trim()

  if (!actionId) return { rejected: true, message: "I can't run that action safely right now." }

  let athleteId =
    suggestedAction?.athleteId ??
    suggestedAction?.clientId ??
    suggestedAction?.meta?.athleteId ??
    null

  const targetRef = String(suggestedAction?.targetRef ?? '').trim()
  if (targetRef === 'active_client') {
    athleteId =
      session?.activeCoachContext?.athleteId ??
      session?.activeCoachContext?.clientId ??
      athleteId
  }

  if (athleteId) {
    const auth = resolveCoachActionClient({
      coachContext,
      explicitAthleteId: athleteId,
      useActiveReferent: false,
    })
    if (!auth.ok) {
      return { rejected: true, message: auth.message }
    }
    athleteId = auth.client.athlete_id
  }

  return {
    actionId,
    athleteId,
    meta: { athleteId },
  }
}
