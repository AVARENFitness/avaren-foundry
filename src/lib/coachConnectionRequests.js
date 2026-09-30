import {
  isActiveBusinessClient,
  isArchivedBusinessClient,
  isLinkedBusinessClient,
  resolveRecordBusinessClientId,
} from './coachBusinessClient'

export const CONNECTION_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
}

export const normalizeConnectionEmail = (value = '') =>
  String(value ?? '').trim().toLowerCase()

export const isPendingConnectionRequest = (request = {}) =>
  String(request?.status ?? '') === CONNECTION_REQUEST_STATUS.PENDING

export const availableBusinessClientsForConnection = (clients = []) =>
  (clients ?? []).filter(
    (client) =>
      isActiveBusinessClient(client) &&
      !isArchivedBusinessClient(client) &&
      !isLinkedBusinessClient(client) &&
      Boolean(resolveRecordBusinessClientId(client)),
  )

export const findExactBusinessClientMatches = (
  clients = [],
  request = {},
) => {
  const available = availableBusinessClientsForConnection(clients)
  const email = normalizeConnectionEmail(request?.athlete_email)
  if (!email) return []

  return available.filter(
    (client) =>
      normalizeConnectionEmail(
        client?.email ?? client?.athlete_email ?? '',
      ) === email,
  )
}

export const findSuggestedBusinessClient = (
  clients = [],
  request = {},
) => {
  const matches = findExactBusinessClientMatches(clients, request)
  return matches.length === 1 ? matches[0] : null
}

export const connectionRequestDisplayName = (request = {}) =>
  request?.display_name ??
  request?.athlete_display_name ??
  request?.athlete_email ??
  'AVAREN athlete'
