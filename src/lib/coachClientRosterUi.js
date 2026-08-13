import {
  formatScheduledSessionDate,
  formatScheduledSessionTime,
} from './sessionTimezone.js'
import {
  isActiveBusinessClient,
  isArchivedBusinessClient,
  isOfflineBusinessClient,
  resolveRecordBusinessClientId,
} from './coachBusinessClient.js'

export const ROSTER_HUB_FILTER = {
  ACTIVE: 'active',
  ATTENTION: 'attention',
  PAST: 'past',
}

export const ROSTER_PREVIEW_LIMIT = 6

const ATTENTION_COMPACT_LABELS = {
  inactive: 'Training gap',
  'frequency-drop': 'Consistency drop',
  'overdue-assignment': 'Assignment overdue',
  'open-assignment': 'Assignment open',
  'readiness-low': 'Recovery concern',
  'nutrition-light': 'Nutrition logging light',
}

export const getClientInitials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export const resolveRosterAttentionLabel = (entry = {}) => {
  const actionable =
    entry.intelligence?.attention?.filter(
      (item) => item.id !== 'all-clear' && item.id !== 'performance-up',
    ) ?? []

  if (actionable.length) {
    const primary = actionable[0]
    return (
      ATTENTION_COMPACT_LABELS[primary.id] ??
      String(primary.title ?? '')
        .replace(/ detected$/i, '')
        .replace(/ is below baseline$/i, ' low')
        .trim()
    )
  }

  if (entry.athleteCheckInStatus === 'missing') {
    return 'Check-in due'
  }

  if (entry.weeklyReviewStatus === 'REVIEW DUE') {
    return 'Review open'
  }

  return null
}

export const formatRosterPassLabel = ({ totalBalance = 0, activeCount = 0 } = {}) => {
  if (!activeCount) return 'No active pass'
  if (totalBalance <= 0) return 'No sessions left'
  if (totalBalance === 1) return '1 session left'
  return `${totalBalance} sessions left`
}

export const formatRosterNextSessionLabel = (session = null) => {
  if (!session) return 'No session scheduled'

  const date = formatScheduledSessionDate(session)
  const time = formatScheduledSessionTime(session)
  if (date && time) return `${date} · ${time}`
  return date || time || 'No session scheduled'
}

export const resolveRosterConnectionHint = (client = {}) => {
  if (isArchivedBusinessClient(client)) return 'Past client'
  if (isOfflineBusinessClient(client)) return 'No app account'
  return null
}

export const buildRosterRowMeta = (
  entry = {},
  { nextSession = null, passSummary = null } = {},
) => {
  const attentionLabel = resolveRosterAttentionLabel(entry)
  const nextSessionText = formatRosterNextSessionLabel(nextSession)
  const resolvedPassSummary =
    passSummary ??
    (entry.card?.passRemainingLabel
      ? { totalBalance: Number(entry.card.passRemainingLabel), activeCount: 1 }
      : null)
  const passText = resolvedPassSummary
    ? formatRosterPassLabel(resolvedPassSummary)
    : null

  const secondaryParts = []
  if (attentionLabel) secondaryParts.push(attentionLabel)
  if (nextSessionText !== 'No session scheduled') {
    secondaryParts.push(nextSessionText)
  } else if (!attentionLabel) {
    secondaryParts.push(nextSessionText)
  }
  if (passText) secondaryParts.push(passText)

  const totalBalance = Number(resolvedPassSummary?.totalBalance ?? 0)
  const activeCount = Number(resolvedPassSummary?.activeCount ?? 0)

  return {
    attentionLabel,
    secondaryLine: secondaryParts.join(' · '),
    passText,
    nextSessionText,
    connectionHint: resolveRosterConnectionHint(entry.client),
    passIsLow: activeCount > 0 && totalBalance > 0 && totalBalance <= 2,
    passIsEmpty: activeCount > 0 && totalBalance <= 0,
  }
}

export const buildUpcomingSessionsByBusinessClientId = (sessions = []) => {
  const map = {}

  for (const session of sessions) {
    if (!session || session.status !== 'scheduled') continue
    const businessClientId =
      session.businessClientId ?? session.business_client_id ?? null
    if (!businessClientId || map[businessClientId]) continue
    map[businessClientId] = session
  }

  return map
}

export const sortRosterEntriesForOperations = (
  entries = [],
  { upcomingByBusinessClientId = {} } = {},
) => {
  const nextTimestamp = (entry) => {
    const businessClientId = resolveRecordBusinessClientId(entry.client)
    const session = upcomingByBusinessClientId[businessClientId]
    if (!session) return Number.POSITIVE_INFINITY
    const value =
      session.startsAt ??
      (session.sessionDate
        ? `${session.sessionDate}T${String(session.startTime ?? '00:00').slice(0, 5)}:00`
        : null)
    const parsed = value ? new Date(value).getTime() : Number.NaN
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
  }

  return [...entries].sort((first, second) => {
    const attentionDiff =
      Number(Boolean(resolveRosterAttentionLabel(second))) -
      Number(Boolean(resolveRosterAttentionLabel(first)))
    if (attentionDiff !== 0) return attentionDiff

    const countDiff = (second.attentionCount ?? 0) - (first.attentionCount ?? 0)
    if (countDiff !== 0) return countDiff

    const scoreDiff = (second.sortScore ?? 0) - (first.sortScore ?? 0)
    if (scoreDiff !== 0) return scoreDiff

    const sessionDiff = nextTimestamp(first) - nextTimestamp(second)
    if (sessionDiff !== 0) return sessionDiff

    return String(first.clientName ?? '').localeCompare(String(second.clientName ?? ''))
  })
}

export const filterRosterEntriesByHubScope = (entries = [], scope = ROSTER_HUB_FILTER.ACTIVE) => {
  if (scope === ROSTER_HUB_FILTER.PAST) {
    return entries.filter((entry) => isArchivedBusinessClient(entry.client))
  }

  if (scope === ROSTER_HUB_FILTER.ATTENTION) {
    return entries.filter(
      (entry) =>
        Boolean(resolveRosterAttentionLabel(entry)) || (entry.attentionCount ?? 0) > 0,
    )
  }

  return entries.filter((entry) => isActiveBusinessClient(entry.client))
}

export const resolveRosterPassSummary = (
  entry = {},
  passAvaContextByBusinessClientId = {},
) => {
  const businessClientId = resolveRecordBusinessClientId(entry.client)
  if (!businessClientId) return null
  return passAvaContextByBusinessClientId[businessClientId]?.passSummary ?? null
}
