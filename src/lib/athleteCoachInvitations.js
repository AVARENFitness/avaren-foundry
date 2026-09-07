import { coachBackend } from './coachBackend'

export const ATHLETE_INVITATION_NOTIFICATION_TYPE = 'coach-invitation'

export const ATHLETE_INVITATION_ACTIONS = {
  ACCEPT: 'accept-coach-invitation',
  DECLINE: 'decline-coach-invitation',
}

export const DEFAULT_INVITATION_COACH_NAME = 'Your coach'

export const normalizeAthleteInvitation = (row = {}) => {
  if (!row || typeof row !== 'object') return null
  const id = row.id ?? row.invitation_id ?? row.invitationId ?? null
  if (!id) return null

  return {
    id: String(id),
    coachId: row.coach_id ?? row.coachId ?? null,
    athleteEmail: row.athlete_email ?? row.athleteEmail ?? '',
    athleteId: row.athlete_id ?? row.athleteId ?? null,
    businessClientId: row.business_client_id ?? row.businessClientId ?? null,
    status: row.status ?? 'pending',
    createdAt: row.created_at ?? row.createdAt ?? null,
    respondedAt: row.responded_at ?? row.respondedAt ?? null,
    coachDisplayName:
      row.coach_display_name ??
      row.coachDisplayName ??
      row.coach_name ??
      row.coachName ??
      null,
  }
}

export const dedupeAthleteInvitations = (invitations = []) => {
  const byId = new Map()
  for (const raw of invitations ?? []) {
    const invitation = normalizeAthleteInvitation(raw)
    if (!invitation) continue
    if (!byId.has(invitation.id)) byId.set(invitation.id, invitation)
  }
  return [...byId.values()]
}

export const resolveInvitationCoachName = (invitation = {}) => {
  const name = String(
    invitation.coachDisplayName ??
      invitation.coach_display_name ??
      invitation.coachName ??
      invitation.coach_name ??
      '',
  ).trim()
  return name || DEFAULT_INVITATION_COACH_NAME
}

export const invitationHomeMessage = (invitation = {}) =>
  `${resolveInvitationCoachName(invitation)} invited you to train with AVAREN`

export const invitationNotificationFingerprint = (invitationId) =>
  `coach-invitation:${String(invitationId)}`

export const buildInvitationNotification = (invitationInput = {}) => {
  const invitation = normalizeAthleteInvitation(invitationInput)
  if (!invitation) return null

  return {
    id: invitation.id,
    invitationId: invitation.id,
    fingerprint: invitationNotificationFingerprint(invitation.id),
    type: ATHLETE_INVITATION_NOTIFICATION_TYPE,
    priority: 96,
    title: 'Coach invitation',
    body: invitationHomeMessage(invitation),
    action: ATHLETE_INVITATION_ACTIONS.ACCEPT,
    actionLabel: 'Accept',
    secondaryAction: ATHLETE_INVITATION_ACTIONS.DECLINE,
    secondaryActionLabel: 'Decline',
    createdAt: invitation.createdAt ?? new Date().toISOString(),
    expiresAt: null,
    read: false,
    remote: false,
    invitation,
  }
}

export const buildInvitationNotifications = (invitations = []) =>
  dedupeAthleteInvitations(invitations)
    .map(buildInvitationNotification)
    .filter(Boolean)

export const isAthleteInvitationNotification = (notification = {}) =>
  notification?.type === ATHLETE_INVITATION_NOTIFICATION_TYPE ||
  notification?.action === ATHLETE_INVITATION_ACTIONS.ACCEPT ||
  notification?.action === ATHLETE_INVITATION_ACTIONS.DECLINE ||
  notification?.secondaryAction === ATHLETE_INVITATION_ACTIONS.DECLINE

export const resolveInvitationIdFromNotification = (notification = {}) =>
  notification.invitationId ??
  notification.invitation?.id ??
  notification.id ??
  null

/**
 * Shared respond path — keeps Accept/Decline semantics identical across surfaces.
 */
export const respondToAthleteInvitation = async ({
  invitationId,
  decision,
  acceptInvitation = coachBackend.acceptInvitation.bind(coachBackend),
  declineInvitation = coachBackend.declineInvitation.bind(coachBackend),
} = {}) => {
  const id = invitationId == null ? null : String(invitationId)
  if (!id) throw new Error('Invitation id is required.')

  if (decision === 'accept') {
    await acceptInvitation(id)
    return { invitationId: id, decision: 'accept' }
  }

  if (decision === 'decline') {
    await declineInvitation(id)
    return { invitationId: id, decision: 'decline' }
  }

  throw new Error('Invitation decision must be accept or decline.')
}
