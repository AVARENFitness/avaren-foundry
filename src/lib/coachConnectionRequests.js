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

export const findSuggestedBusinessClient = (
  clients = [],
  request = {},
) => {
  const available = availableBusinessClientsForConnection(clients)
  const email = normalizeConnectionEmail(request?.athlete_email)
  if (!email) return null

  return (
    available.find(
      (client) =>
        normalizeConnectionEmail(
          client?.email ?? client?.athlete_email ?? '',
        ) === email,
    ) ?? null
  )
}

export const connectionRequestDisplayName = (request = {}) =>
  request?.display_name ??
  request?.athlete_display_name ??
  request?.athlete_email ??
  'AVAREN athlete'
