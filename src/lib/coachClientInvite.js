import {
  hasLinkedAthlete,
  isActiveBusinessClient,
  isArchivedBusinessClient,
  resolveRecordBusinessClientId,
} from './coachBusinessClient'
import { validateInviteEmail } from './coachClientUi'

export const CLIENT_INVITE_STATUS = {
  CONNECTED: 'connected',
  PENDING: 'pending',
  NOT_CONNECTED: 'not_connected',
}

export const CLIENT_INVITE_STATUS_LABEL = {
  [CLIENT_INVITE_STATUS.CONNECTED]: 'Connected to AVAREN',
  [CLIENT_INVITE_STATUS.PENDING]: 'Invite pending',
  [CLIENT_INVITE_STATUS.NOT_CONNECTED]: 'Not connected',
}

export const normalizeInviteEmail = (value = '') =>
  String(value ?? '').trim().toLowerCase()

export const findActiveBusinessClientByEmail = (
  clients = [],
  email = '',
) => {
  const normalized = normalizeInviteEmail(email)
  if (!normalized) return null

  return (
    (clients ?? []).find((client) => {
      if (!isActiveBusinessClient(client) || isArchivedBusinessClient(client)) {
        return false
      }
      const clientEmail = normalizeInviteEmail(
        client.email ?? client.athlete_email ?? '',
      )
      return clientEmail && clientEmail === normalized
    }) ?? null
  )
}

export const findPendingInviteForBusinessClient = (
  invitations = [],
  businessClientId = null,
  email = '',
) => {
  const bcId = businessClientId == null ? null : String(businessClientId)
  const normalizedEmail = normalizeInviteEmail(email)

  return (
    (invitations ?? []).find((invite) => {
      if (String(invite?.status ?? '') !== 'pending') return false
      const inviteBc =
        invite.business_client_id ?? invite.businessClientId ?? null
      if (bcId && inviteBc && String(inviteBc) === bcId) return true
      if (
        normalizedEmail &&
        normalizeInviteEmail(invite.athlete_email ?? invite.athleteEmail) ===
          normalizedEmail
      ) {
        return true
      }
      return false
    }) ?? null
  )
}

export const resolveClientInviteStatus = ({
  client = {},
  invitations = [],
} = {}) => {
  if (isArchivedBusinessClient(client)) {
    return CLIENT_INVITE_STATUS.NOT_CONNECTED
  }
  if (hasLinkedAthlete(client)) {
    return CLIENT_INVITE_STATUS.CONNECTED
  }

  const businessClientId = resolveRecordBusinessClientId(client)
  const pending = findPendingInviteForBusinessClient(
    invitations,
    businessClientId,
    client.email ?? client.athlete_email ?? '',
  )
  if (pending) return CLIENT_INVITE_STATUS.PENDING
  return CLIENT_INVITE_STATUS.NOT_CONNECTED
}

export const resolveClientInviteStatusLabel = (status) =>
  CLIENT_INVITE_STATUS_LABEL[status] ??
  CLIENT_INVITE_STATUS_LABEL[CLIENT_INVITE_STATUS.NOT_CONNECTED]

export const canInviteBusinessClientToAvaren = ({
  client = {},
  invitations = [],
} = {}) => {
  if (!client || isArchivedBusinessClient(client)) return false
  if (hasLinkedAthlete(client)) return false
  const businessClientId = resolveRecordBusinessClientId(client)
  if (!businessClientId) return false
  return !findPendingInviteForBusinessClient(
    invitations,
    businessClientId,
    client.email ?? client.athlete_email ?? '',
  )
}

/**
 * Shared create path: optional invite flag.
 * Reuses existing active client by email when present.
 */
export const createBusinessClientWithOptionalInvite = async ({
  payload = {},
  invite = false,
  existingClients = [],
  invitations = [],
  createBusinessClient,
  inviteAthlete,
  updateBusinessClientEmail = null,
} = {}) => {
  const email = normalizeInviteEmail(payload.email ?? '')
  if (invite) {
    const emailError = validateInviteEmail(email)
    if (emailError) {
      const error = new Error(emailError)
      error.code = 'email_required'
      throw error
    }
  }

  const existing = email
    ? findActiveBusinessClientByEmail(existingClients, email)
    : null

  let businessClientId = existing
    ? resolveRecordBusinessClientId(existing)
    : null
  let created = false
  let reusedExisting = Boolean(existing)

  if (!businessClientId) {
    const result = await createBusinessClient({
      ...payload,
      email: email || null,
    })
    businessClientId =
      result?.business_client_id ?? result?.businessClientId ?? null
    created = true
    if (!businessClientId) {
      throw new Error('business_client_not_found')
    }
  }

  let invitation = null
  if (invite) {
    const pending = findPendingInviteForBusinessClient(
      invitations,
      businessClientId,
      email,
    )
    if (pending) {
      const error = new Error('invite_already_pending')
      error.code = 'invite_already_pending'
      error.businessClientId = businessClientId
      error.invitation = pending
      throw error
    }

    if (
      updateBusinessClientEmail &&
      email &&
      normalizeInviteEmail(existing?.email ?? '') !== email
    ) {
      await updateBusinessClientEmail({
        businessClientId,
        email,
      })
    }

    invitation = await inviteAthlete(email, { businessClientId })
  }

  return {
    businessClientId,
    created,
    reusedExisting,
    invited: Boolean(invite),
    invitation,
  }
}

export const mapInviteUserMessage = (error = null, fallback = 'Unable to send invitation.') => {
  const raw = String(error?.message ?? error?.code ?? error ?? '')
  if (/email_required|Enter a valid athlete email/i.test(raw)) {
    return 'Enter a valid athlete email.'
  }
  if (/invite_already_pending|duplicate key|unique_violation/i.test(raw)) {
    return 'An invitation is already pending for this client.'
  }
  if (/business_client_already_linked/i.test(raw)) {
    return 'This client is already connected to AVAREN.'
  }
  if (/business_client_archived/i.test(raw)) {
    return 'Archived clients cannot be invited.'
  }
  if (/business_client_not_found/i.test(raw)) {
    return 'Client record not found. Refresh and try again.'
  }
  return fallback
}
