import {
  filterActiveRoster,
  filterArchivedRoster,
  resolveRecordBusinessClientId,
  resolveCoachClientRosterKey,
  isActiveBusinessClient,
  resolveAthleteDataId,
  resolveCanonicalLinkedUserId,
} from './coachBusinessClient.js'

export const ROSTER_SCOPE = {
  ACTIVE: 'active',
  PAST: 'past',
  ALL: 'all',
}

export const buildCoachClientMaps = (clients = []) => {
  const byBusinessClientId = {}
  const byAthleteId = {}
  const byRosterKey = {}

  for (const client of clients) {
    if (!client || typeof client !== 'object') continue
    const businessClientId = resolveRecordBusinessClientId(client)
    if (businessClientId) {
      byBusinessClientId[businessClientId] = client
    }
    if (client.athlete_id) {
      byAthleteId[client.athlete_id] = client
    }
    const rosterKey = resolveCoachClientRosterKey(client)
    if (rosterKey) {
      byRosterKey[rosterKey] = client
    }
  }

  return { byBusinessClientId, byAthleteId, byRosterKey }
}

export const resolveClientForSession = (session = {}, maps = {}) => {
  const businessClientId =
    session.businessClientId ?? session.business_client_id ?? null
  if (businessClientId && maps.byBusinessClientId?.[businessClientId]) {
    return maps.byBusinessClientId[businessClientId]
  }

  const athleteId = session.athleteId ?? session.athlete_id ?? null
  if (athleteId && maps.byAthleteId?.[athleteId]) {
    return maps.byAthleteId[athleteId]
  }

  return null
}

export const findClientByRosterKey = (clients = [], clientOrKey = null) => {
  if (!clientOrKey) return null
  if (typeof clientOrKey === 'string') {
    return (
      clients.find(
        (client) => resolveCoachClientRosterKey(client) === clientOrKey,
      ) ?? null
    )
  }

  const key = resolveCoachClientRosterKey(clientOrKey)
  if (!key) return clientOrKey
  return (
    clients.find((client) => resolveCoachClientRosterKey(client) === key) ??
    clientOrKey
  )
}

export const filterClientsByRosterScope = (clients = [], scope = ROSTER_SCOPE.ACTIVE) => {
  if (scope === ROSTER_SCOPE.PAST) {
    return filterArchivedRoster(clients)
  }
  if (scope === ROSTER_SCOPE.ALL) {
    return clients
  }
  return filterActiveRoster(clients)
}

export const filterSchedulableClients = (clients = []) =>
  filterActiveRoster(clients)

export const isPortfolioAthleteClient = (client = {}) =>
  isActiveBusinessClient(client) &&
  Boolean(resolveAthleteDataId(client))
