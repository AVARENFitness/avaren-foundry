import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRpc = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'athlete-1', email: 'sam@example.com' } },
        error: null,
      }),
    },
    rpc: (...args) => mockRpc(...args),
    from: vi.fn(),
  },
}))

describe('coachBackend invitation accept linking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('accepts via business-client RPC so existing roster row is linked', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        business_client_id: 'bc-existing',
        future_appointments_backfilled: 0,
      },
      error: null,
    })

    const { coachBackend } = await import('./coachBackend')
    const result = await coachBackend.acceptInvitation('inv-1')

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith(
      'accept_coach_invitation_for_business_client',
      { p_invitation_id: 'inv-1' },
    )
    expect(result).toMatchObject({
      ok: true,
      business_client_id: 'bc-existing',
    })
  })

  it('falls back to legacy accept only when invitation lacks business client', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'invitation_missing_business_client' },
      })
      .mockResolvedValueOnce({
        data: { ok: true },
        error: null,
      })

    const { coachBackend } = await import('./coachBackend')
    await coachBackend.acceptInvitation('inv-legacy')

    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      'accept_coach_invitation_for_business_client',
      { p_invitation_id: 'inv-legacy' },
    )
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'accept_coach_invitation', {
      invitation_id: 'inv-legacy',
    })
  })

  it('inviteAthlete with businessClientId uses invite_business_client_to_avaren', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        invitation_id: 'inv-2',
        business_client_id: 'bc-1',
      },
      error: null,
    })

    const { coachBackend } = await import('./coachBackend')
    await coachBackend.inviteAthlete('  Sam@Example.COM ', {
      businessClientId: 'bc-1',
    })

    expect(mockRpc).toHaveBeenCalledWith('invite_business_client_to_avaren', {
      p_business_client_id: 'bc-1',
      p_athlete_email: 'sam@example.com',
    })
  })
})
