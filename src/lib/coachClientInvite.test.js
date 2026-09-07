import { describe, expect, it, vi } from 'vitest'
import {
  CLIENT_INVITE_STATUS,
  canInviteBusinessClientToAvaren,
  createBusinessClientWithOptionalInvite,
  findActiveBusinessClientByEmail,
  findPendingInviteForBusinessClient,
  mapInviteUserMessage,
  normalizeInviteEmail,
  resolveClientInviteStatus,
  resolveClientInviteStatusLabel,
} from './coachClientInvite'

const activeClient = {
  id: 'bc-1',
  business_client_id: 'bc-1',
  status: 'active',
  email: 'sam@example.com',
  linked_user_id: null,
  first_name: 'Sam',
  last_name: 'Lee',
}

describe('coachClientInvite', () => {
  it('normalizes invite email', () => {
    expect(normalizeInviteEmail('  Sam@Example.COM ')).toBe('sam@example.com')
  })

  it('finds active business client by normalized email', () => {
    expect(
      findActiveBusinessClientByEmail([activeClient], 'SAM@example.com'),
    ).toEqual(activeClient)
    expect(
      findActiveBusinessClientByEmail(
        [{ ...activeClient, status: 'archived' }],
        'sam@example.com',
      ),
    ).toBeNull()
  })

  it('resolves pending invite status for unlinked clients', () => {
    expect(
      resolveClientInviteStatus({
        client: activeClient,
        invitations: [],
      }),
    ).toBe(CLIENT_INVITE_STATUS.NOT_CONNECTED)

    expect(
      resolveClientInviteStatusLabel(
        resolveClientInviteStatus({
          client: activeClient,
          invitations: [
            {
              id: 'inv-1',
              status: 'pending',
              business_client_id: 'bc-1',
              athlete_email: 'sam@example.com',
            },
          ],
        }),
      ),
    ).toBe('Invite pending')

    expect(
      resolveClientInviteStatusLabel(
        resolveClientInviteStatus({
          client: { ...activeClient, linked_user_id: 'user-1' },
          invitations: [],
        }),
      ),
    ).toBe('Connected to AVAREN')

    expect(
      resolveClientInviteStatus({
        client: activeClient,
        invitations: [
          {
            id: 'inv-2',
            status: 'declined',
            business_client_id: 'bc-1',
            athlete_email: 'sam@example.com',
          },
        ],
      }),
    ).toBe(CLIENT_INVITE_STATUS.NOT_CONNECTED)
  })

  it('creates active business client only when invite is false', async () => {
    const createBusinessClient = vi.fn().mockResolvedValue({
      business_client_id: 'bc-new',
    })
    const inviteAthlete = vi.fn()

    const result = await createBusinessClientWithOptionalInvite({
      payload: { firstName: 'Ada', lastName: 'Lovelace', email: null },
      invite: false,
      createBusinessClient,
      inviteAthlete,
    })

    expect(createBusinessClient).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: null,
      }),
    )
    expect(inviteAthlete).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      businessClientId: 'bc-new',
      created: true,
      invited: false,
    })
  })

  it('requires email for Add & Invite', async () => {
    const createBusinessClient = vi.fn()
    await expect(
      createBusinessClientWithOptionalInvite({
        payload: { firstName: 'Ada', email: '' },
        invite: true,
        createBusinessClient,
        inviteAthlete: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'email_required' })
    expect(createBusinessClient).not.toHaveBeenCalled()
  })

  it('creates business client and pending invite together', async () => {
    const createBusinessClient = vi.fn().mockResolvedValue({
      business_client_id: 'bc-new',
    })
    const inviteAthlete = vi.fn().mockResolvedValue({
      invitation_id: 'inv-1',
      business_client_id: 'bc-new',
    })

    const result = await createBusinessClientWithOptionalInvite({
      payload: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: '  Ada@Example.COM ',
      },
      invite: true,
      createBusinessClient,
      inviteAthlete,
    })

    expect(createBusinessClient).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com' }),
    )
    expect(inviteAthlete).toHaveBeenCalledWith('ada@example.com', {
      businessClientId: 'bc-new',
    })
    expect(result.invited).toBe(true)
    expect(result.invitation).toMatchObject({ invitation_id: 'inv-1' })
  })

  it('reuses existing active client by email instead of creating a duplicate', async () => {
    const createBusinessClient = vi.fn()
    const inviteAthlete = vi.fn().mockResolvedValue({ invitation_id: 'inv-2' })

    const result = await createBusinessClientWithOptionalInvite({
      payload: { firstName: 'Sam', email: 'SAM@example.com' },
      invite: true,
      existingClients: [activeClient],
      invitations: [],
      createBusinessClient,
      inviteAthlete,
    })

    expect(createBusinessClient).not.toHaveBeenCalled()
    expect(inviteAthlete).toHaveBeenCalledWith('sam@example.com', {
      businessClientId: 'bc-1',
    })
    expect(result).toMatchObject({
      businessClientId: 'bc-1',
      created: false,
      reusedExisting: true,
      invited: true,
    })
  })

  it('prevents duplicate pending invites for the same client/email', async () => {
    const createBusinessClient = vi.fn()
    const inviteAthlete = vi.fn()

    await expect(
      createBusinessClientWithOptionalInvite({
        payload: { firstName: 'Sam', email: 'sam@example.com' },
        invite: true,
        existingClients: [activeClient],
        invitations: [
          {
            id: 'inv-pending',
            status: 'pending',
            business_client_id: 'bc-1',
            athlete_email: 'sam@example.com',
          },
        ],
        createBusinessClient,
        inviteAthlete,
      }),
    ).rejects.toMatchObject({ code: 'invite_already_pending' })

    expect(createBusinessClient).not.toHaveBeenCalled()
    expect(inviteAthlete).not.toHaveBeenCalled()
  })

  it('finds pending invites by business client id or email', () => {
    expect(
      findPendingInviteForBusinessClient(
        [
          {
            id: 'inv-1',
            status: 'pending',
            business_client_id: 'bc-1',
            athlete_email: 'other@example.com',
          },
        ],
        'bc-1',
        '',
      )?.id,
    ).toBe('inv-1')

    expect(
      findPendingInviteForBusinessClient(
        [
          {
            id: 'inv-2',
            status: 'pending',
            athlete_email: 'Sam@Example.com',
          },
        ],
        null,
        'sam@example.com',
      )?.id,
    ).toBe('inv-2')
  })

  it('gates later invite from unlinked clients', () => {
    expect(
      canInviteBusinessClientToAvaren({
        client: activeClient,
        invitations: [],
      }),
    ).toBe(true)

    expect(
      canInviteBusinessClientToAvaren({
        client: activeClient,
        invitations: [
          {
            id: 'inv-1',
            status: 'pending',
            business_client_id: 'bc-1',
          },
        ],
      }),
    ).toBe(false)

    expect(
      canInviteBusinessClientToAvaren({
        client: { ...activeClient, linked_user_id: 'user-1' },
        invitations: [],
      }),
    ).toBe(false)
  })

  it('maps invite user messages', () => {
    expect(mapInviteUserMessage({ code: 'invite_already_pending' })).toMatch(
      /already pending/i,
    )
    expect(mapInviteUserMessage({ message: 'email_required' })).toMatch(
      /valid athlete email/i,
    )
  })
})
