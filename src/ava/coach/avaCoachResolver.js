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
  explainClientAttention,
  formatClientSummaryMessage,
  runCoachQuery,
} from './avaCoachQueries'
import {
  isCoachOperationalQuery,
  matchCoachOperationalQuery,
} from './avaCoachQueryPatterns'

const normalize = (value = '') =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/\s+/g, ' ')

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

const WHY_PATTERNS = [
  /^why (.+)\??$/,
  /^why is (.+) flagged\??$/,
  /^why is (.+) on (?:the list|attention)\??$/,
  /^what(?:'s| is) going on with (.+)\??$/,
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

export const isCoachPortfolioQueryCommand = (message = '') =>
  isCoachOperationalQuery(message)

export const isCoachExplainCommand = (message = '') => {
  const text = normalize(message)
  return (
    matchesAny(text, WHY_PATTERNS) ||
    /^what(?:'s| is) going on with this client\??$/.test(text)
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

export const resolveCoachWhyCommand = (
  message = '',
  { coachContext = {}, session = null } = {},
) => {
  const text = normalize(message)
  if (!isCoachExplainCommand(message)) return null

  if (/^what(?:'s| is) going on with this client/.test(text)) {
    const auth = resolveCoachActionClient({ coachContext, session })
    if (!auth.ok) {
      return {
        kind: 'response',
        message: 'Which client should I explain? Open a client first, or say their name.',
      }
    }
    return {
      kind: 'response',
      message: explainClientAttention(auth.client.athlete_id, coachContext),
    }
  }

  let nameQuery = null
  for (const pattern of WHY_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      nameQuery = match[1].trim()
      break
    }
  }

  if (!nameQuery) return null

  if (/^(him|her|them|this client)$/.test(nameQuery)) {
    const auth = resolveCoachActionClient({ coachContext, session })
    if (!auth.ok) {
      return {
        kind: 'response',
        message: 'Which client should I explain? Open a client first, or say their name.',
      }
    }
    return {
      kind: 'response',
      message: explainClientAttention(auth.client.athlete_id, coachContext),
    }
  }

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
        actionId: AVA_ACTION_IDS.CLIENT_SUMMARY,
        query: nameQuery,
        explainAttention: true,
      },
    }
  }

  return {
    kind: 'response',
    message: explainClientAttention(resolution.athleteId, coachContext),
  }
}

export const resolveCoachQueryCommand = (message = '', { coachContext = {} } = {}) => {
  const match = matchCoachOperationalQuery(message)
  if (!match?.actionId) return null

  const result = runCoachQuery(match.actionId, coachContext)
  return {
    kind: 'query',
    actionId: match.actionId,
    queryType: match.queryType,
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

  const why = resolveCoachWhyCommand(message, context)
  if (why) return why

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
