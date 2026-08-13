import { beforeEach, describe, expect, it, vi } from 'vitest'

const businessClientId = '11111111-1111-4111-8111-111111111111'

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}))

import { supabase } from './supabase'

describe('coachBackend roster coaching requirements hydration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('enriches list_coach_business_clients rows with coaching_requirements from table', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        {
          business_client_id: businessClientId,
          coach_id: 'coach-1',
          linked_user_id: '22222222-2222-4222-8222-222222222222',
          first_name: 'Jake',
          status: 'active',
        },
      ],
      error: null,
    })

    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: businessClientId,
              coaching_requirements: { weekly_check_in: 'not_required' },
            },
          ],
          error: null,
        }),
      }),
    })

    const { coachBackend } = await import('./coachBackend.js')
    const roster = await coachBackend.listBusinessClients()

    expect(supabase.from).toHaveBeenCalledWith('coach_business_clients')
    expect(roster[0].coaching_requirements).toEqual({
      weekly_check_in: 'not_required',
    })
  })
})
