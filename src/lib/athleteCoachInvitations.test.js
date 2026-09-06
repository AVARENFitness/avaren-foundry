import { describe, expect, it, vi } from 'vitest'
import {
  ATHLETE_INVITATION_ACTIONS,
  ATHLETE_INVITATION_NOTIFICATION_TYPE,
  buildInvitationNotification,
  buildInvitationNotifications,
  dedupeAthleteInvitations,
  invitationHomeMessage,
  normalizeAthleteInvitation,
  respondToAthleteInvitation,
  resolveInvitationCoachName,
  resolveInvitationIdFromNotification,
} from './athleteCoachInvitations'

describe('athleteCoachInvitations', () => {
  it('normalizes and dedupes invitations by id', () => {
    const invitations = dedupeAthleteInvitations([
      {
        id: 'inv-1',
        coach_id: 'coach-1',
        athlete_email: 'a@example.com',
        status: 'pending',
        created_at: '2026-09-01T12:00:00.000Z',
        coach_display_name: 'Jordan',
      },
      {
        id: 'inv-1',
        coach_id: 'coach-1',
        athlete_email: 'a@example.com',
        status: 'pending',
      },
      {
        id: 'inv-2',
        coachId: 'coach-2',
        athleteEmail: 'a@example.com',
        status: 'pending',
      },
    ])

    expect(invitations).toHaveLength(2)
    expect(invitations[0]).toMatchObject({
      id: 'inv-1',
      coachDisplayName: 'Jordan',
    })
  })

  it('builds home copy and notification with shared invitation id', () => {
    const invitation = normalizeAthleteInvitation({
      id: 'inv-9',
      coach_display_name: 'Alex',
      created_at: '2026-09-02T10:00:00.000Z',
    })

    expect(invitationHomeMessage(invitation)).toBe(
      'Alex invited you to train with AVAREN',
    )
    expect(resolveInvitationCoachName({})).toBe('Your coach')

    const notification = buildInvitationNotification(invitation)
    expect(notification.type).toBe(ATHLETE_INVITATION_NOTIFICATION_TYPE)
    expect(notification.invitationId).toBe('inv-9')
    expect(notification.fingerprint).toBe('coach-invitation:inv-9')
    expect(notification.action).toBe(ATHLETE_INVITATION_ACTIONS.ACCEPT)
    expect(notification.secondaryAction).toBe(
      ATHLETE_INVITATION_ACTIONS.DECLINE,
    )
    expect(resolveInvitationIdFromNotification(notification)).toBe('inv-9')
  })

  it('does not duplicate notifications for one invitation', () => {
    const notifications = buildInvitationNotifications([
      { id: 'inv-1', coach_display_name: 'Alex' },
      { id: 'inv-1', coach_display_name: 'Alex' },
    ])
    expect(notifications).toHaveLength(1)
  })

  it('accept and decline use canonical invitation RPCs', async () => {
    const acceptInvitation = vi.fn().mockResolvedValue({ ok: true })
    const declineInvitation = vi.fn().mockResolvedValue({ ok: true })

    await respondToAthleteInvitation({
      invitationId: 'inv-accept',
      decision: 'accept',
      acceptInvitation,
      declineInvitation,
    })
    expect(acceptInvitation).toHaveBeenCalledWith('inv-accept')
    expect(declineInvitation).not.toHaveBeenCalled()

    await respondToAthleteInvitation({
      invitationId: 'inv-decline',
      decision: 'decline',
      acceptInvitation,
      declineInvitation,
    })
    expect(declineInvitation).toHaveBeenCalledWith('inv-decline')
  })
})
