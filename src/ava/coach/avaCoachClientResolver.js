import {
  buildDisplayNameInputFromClient,
  emailPrefixFallback,
  getAthleteDisplayName,
  getClientDisplayName,
  getClientDisambiguationLabel,
  getClientFullName,
  normalizeWhitespace,
} from '../../lib/clientDisplayName'

const normalize = (value = '') =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/\s+/g, ' ')

export const COACH_CLIENT_COMMAND_PATTERNS = [
  /^open ([a-z][a-z\s'-]{1,40})\.?$/,
  /^show me ([a-z][a-z\s'-]+?)(?:'?s profile)?\.?$/,
  /^show ([a-z][a-z\s'-]+?)(?:'?s profile)?\.?$/,
  /^take me to ([a-z][a-z\s'-]+?)(?:'?s client page)?\.?$/,
  /^give me an update on ([a-z][a-z\s'-]{1,40})\.?$/,
  /^give me a quick update on ([a-z][a-z\s'-]{1,40})\.?$/,
  /^quick update on ([a-z][a-z\s'-]{1,40})\.?$/,
  /^update on ([a-z][a-z\s'-]{1,40})\.?$/,
]

export const COACH_CLIENT_REVIEW_PATTERNS = [
  /^(?:show me|show|open|pull up)\s+([a-z][a-z\s'-]{1,40})(?:'s|s)?\s+review\.?$/,
  /^(?:show me|show|open|pull up)\s+([a-z][a-z\s'-]{1,40})'s\s+review\.?$/,
]

const RESERVED_CLIENT_QUERIES =
  /^(coach hub|my clients|clients|coaching|nutrition|recovery|weekly reviews?|client list)$/

export const isCoachClientNameCommand = (message = '') =>
  Boolean(extractClientNameFromMessage(message))

const stripClientQuerySuffix = (value = '') =>
  String(value ?? '')
    .trim()
    .replace(/(?:'s| profile| client page| review)+$/i, '')
    .trim()

export const normalizePossessiveClientQuery = (query = '') => {
  let value = String(query ?? '').trim()
  if (!value) return ''

  value = value.replace(/[\u2018\u2019\u2032]/g, "'")

  const apostropheMatch = value.match(/^(.+?)'s$/i)
  if (apostropheMatch?.[1]) {
    return apostropheMatch[1].trim()
  }

  const trailingApostropheMatch = value.match(/^(.+?)s'$/i)
  if (trailingApostropheMatch?.[1]) {
    return trailingApostropheMatch[1].trim()
  }

  return value
}

export const possessiveLookupVariants = (query = '') => {
  const stripped = normalizePossessiveClientQuery(query)
  const normalized = normalize(stripped)
  const variants = new Set([normalized, stripped.trim().toLowerCase()].filter(Boolean))

  const lower = normalized.toLowerCase()
  if (/^[a-z]{3,}s$/.test(lower) && !lower.endsWith('ss')) {
    variants.add(lower.slice(0, -1))
  }

  return [...variants]
}

export const extractClientReviewTarget = (message = '') => {
  const text = normalize(message)

  for (const pattern of COACH_CLIENT_REVIEW_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const candidate = normalizePossessiveClientQuery(stripClientQuerySuffix(match[1]))
      if (candidate && !RESERVED_CLIENT_QUERIES.test(candidate)) {
        return candidate
      }
    }
  }

  return null
}

export const isCoachClientReviewCommand = (message = '') =>
  Boolean(extractClientReviewTarget(message))

export const isCoachClientUpdateCommand = (message = '') => {
  const text = normalize(message)
  return (
    /give me an update on /.test(text) ||
    /give me a quick update on /.test(text) ||
    /quick update on /.test(text) ||
    /^update on /.test(text)
  )
}

export const extractClientNameFromMessage = (message = '') => {
  const reviewTarget = extractClientReviewTarget(message)
  if (reviewTarget) return reviewTarget

  const text = normalize(message)

  for (const pattern of COACH_CLIENT_COMMAND_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const candidate = normalizePossessiveClientQuery(stripClientQuerySuffix(match[1]))
      if (candidate && !RESERVED_CLIENT_QUERIES.test(candidate)) {
        return candidate
      }
    }
  }

  return null
}

export const buildCoachClientResolutionRecord = (client = {}) => {
  const input = buildDisplayNameInputFromClient(client)
  const profile = input.profile
  const fullName = normalizeWhitespace(
    [profile.first_name, profile.last_name].filter(Boolean).join(' '),
  )

  return {
    athleteId: client.athlete_id ?? null,
    client,
    coachLabel: input.coachLabel,
    preferredName: profile.preferred_name,
    firstName: profile.first_name,
    lastName: profile.last_name,
    fullName,
    displayName: profile.display_name,
    canonicalDisplayName: getClientDisplayName(client),
    athleteDisplayName: getAthleteDisplayName(client),
    disambiguationLabel: getClientDisambiguationLabel(client),
    legacyName: input.legacyName,
    emailPrefix: normalizeWhitespace(emailPrefixFallback(input.email)).toLowerCase(),
  }
}

const exactFieldMatches = (records = [], field, query) =>
  records.filter((record) => normalize(record[field]) === query)

export const logAvaCoachResolveDiagnostic = ({
  queryType = 'client_name',
  authorizedClientCount = 0,
  matchCount = 0,
  matchSource = null,
  ambiguous = false,
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-coach-resolve]',
    JSON.stringify({
      queryType,
      authorizedClientCount,
      matchCount,
      matchSource,
      ambiguous,
    }),
  )
}

export const resolveAuthorizedCoachClient = (query = '', clients = []) => {
  const records = (clients ?? [])
    .filter((client) => client?.athlete_id)
    .map(buildCoachClientResolutionRecord)

  const lookupVariants = possessiveLookupVariants(query)

  if (!lookupVariants.length || lookupVariants.every((item) => !item)) {
    return {
      status: 'none',
      matches: [],
      message: `I couldn't find an authorized client matching "${String(query).trim()}".`,
      matchSource: null,
    }
  }

  const precedence = [
    { field: 'coachLabel', source: 'coach_label' },
    { field: 'preferredName', source: 'preferred_name' },
    { field: 'fullName', source: 'full_name' },
    { field: 'displayName', source: 'display_name' },
    { field: 'firstName', source: 'first_name' },
    { field: 'canonicalDisplayName', source: 'full_name' },
    { field: 'athleteDisplayName', source: 'full_name' },
    { field: 'legacyName', source: 'legacy' },
    { field: 'emailPrefix', source: 'legacy' },
  ]

  for (const normalizedQuery of lookupVariants) {
    for (const { field, source } of precedence) {
      const matches = exactFieldMatches(records, field, normalizedQuery)
      if (matches.length === 1) {
        logAvaCoachResolveDiagnostic({
          authorizedClientCount: records.length,
          matchCount: 1,
          matchSource: source,
          ambiguous: false,
        })
        return {
          status: 'resolved',
          record: matches[0],
          matches,
          matchSource: source,
        }
      }
      if (matches.length > 1) {
        logAvaCoachResolveDiagnostic({
          authorizedClientCount: records.length,
          matchCount: matches.length,
          matchSource: source,
          ambiguous: true,
        })
        return {
          status: 'ambiguous',
          records: matches,
          matches,
          matchSource: source,
          message: `Which ${String(query).trim()} did you mean?`,
        }
      }
    }
  }

  for (const normalizedQuery of lookupVariants) {
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
    const partialMatches = records.filter((record) => {
      const haystacks = [
        record.coachLabel,
        record.preferredName,
        record.fullName,
        record.displayName,
        record.firstName,
        record.lastName,
        record.canonicalDisplayName,
        record.legacyName,
        record.emailPrefix,
      ]
        .filter(Boolean)
        .map((value) => normalize(value))

      return tokens.every((token) =>
        haystacks.some(
          (haystack) => haystack.includes(token) || token.includes(haystack),
        ),
      )
    })

    if (partialMatches.length === 1) {
      logAvaCoachResolveDiagnostic({
        authorizedClientCount: records.length,
        matchCount: 1,
        matchSource: 'partial_name',
        ambiguous: false,
      })
      return {
        status: 'resolved',
        record: partialMatches[0],
        matches: partialMatches,
        matchSource: 'partial_name',
      }
    }

    if (partialMatches.length > 1) {
      logAvaCoachResolveDiagnostic({
        authorizedClientCount: records.length,
        matchCount: partialMatches.length,
        matchSource: 'partial_name',
        ambiguous: true,
      })
      return {
        status: 'ambiguous',
        records: partialMatches,
        matches: partialMatches,
        matchSource: 'partial_name',
        message: `Which ${String(query).trim()} did you mean?`,
      }
    }
  }

  logAvaCoachResolveDiagnostic({
    authorizedClientCount: records.length,
    matchCount: 0,
    matchSource: null,
    ambiguous: false,
  })

  return {
    status: 'none',
    matches: [],
    message: `I couldn't find ${String(query).trim()} in your client roster.`,
    matchSource: null,
  }
}

export const buildCoachClientLabel = (client = {}) => getClientDisplayName(client)

export const resolveCoachClientByName = (query = '', clients = []) => {
  const resolution = resolveAuthorizedCoachClient(query, clients)

  if (resolution.status === 'none') {
    return {
      status: 'none',
      matches: [],
      message: resolution.message,
    }
  }

  if (resolution.status === 'ambiguous') {
    return {
      status: 'ambiguous',
      matches: resolution.matches.map((record) => ({
        client: record.client,
        athleteId: record.athleteId,
        clientName: record.canonicalDisplayName,
        label: record.disambiguationLabel,
        subtitle: record.disambiguationLabel,
      })),
      message: resolution.message,
    }
  }

  const record = resolution.record
  return {
    status: 'resolved',
    client: record.client,
    clientName: record.canonicalDisplayName,
    athleteId: record.athleteId,
    matches: resolution.matches?.map((entry) => entry.client) ?? [record.client],
    matchSource: resolution.matchSource,
  }
}

export const matchCoachClientsByName = (query = '', clients = []) => {
  const resolution = resolveAuthorizedCoachClient(query, clients)
  if (resolution.status === 'none') return []
  return (resolution.matches ?? []).map((record) => record.client)
}

export const buildCoachClientChoices = (matches = []) =>
  matches.map((entry) => ({
    id: entry.athleteId ?? entry.client?.athlete_id,
    name: entry.label ?? entry.clientName ?? buildCoachClientLabel(entry.client),
    label: entry.label ?? entry.clientName ?? buildCoachClientLabel(entry.client),
    subtitle: entry.subtitle ?? getClientDisambiguationLabel(entry.client ?? entry),
    meta: {
      athleteId: entry.athleteId ?? entry.client?.athlete_id,
      clientId: entry.athleteId ?? entry.client?.athlete_id,
      clientName:
        entry.clientName ?? buildCoachClientLabel(entry.client ?? entry),
    },
  }))
