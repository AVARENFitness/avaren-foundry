import { describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args) => rpcMock(...args),
  },
}))

import {
  fetchCoachAuthorization,
  isCoachAccount,
} from '../config/coachAccess'
import { canAccessCoachHub } from '../hooks/useCoachAccess'

describe('coach access', () => {
  it('allows the owner coach account into Coach Hub', () => {
    const session = {
      user: { email: 'hello@avarenfitness.com', id: 'owner-id' },
    }

    expect(isCoachAccount(session)).toBe(true)
    expect(canAccessCoachHub(session, false)).toBe(true)
  })

  it('hides Coach Hub from regular athlete accounts', () => {
    const session = {
      user: { email: 'athlete@example.com', id: 'athlete-id' },
    }

    expect(isCoachAccount(session)).toBe(false)
    expect(canAccessCoachHub(session, false)).toBe(false)
  })

  it('allows allowlisted coaches confirmed by Supabase RPC', () => {
    const session = {
      user: { email: 'trainer@studio.com', id: 'coach-id' },
    }

    expect(canAccessCoachHub(session, true)).toBe(true)
  })

  it('rejects direct Coach Hub navigation for non-coaches', () => {
    const session = {
      user: { email: 'athlete@example.com', id: 'athlete-id' },
    }
    const screen = 'coach-hub'
    const shouldRenderCoachHub =
      screen === 'coach-hub' && canAccessCoachHub(session, false)

    expect(shouldRenderCoachHub).toBe(false)
  })

  it('fetches coach authorization from is_avaren_coach when configured', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })

    const session = {
      user: { email: 'trainer@studio.com', id: 'coach-id' },
    }

    const authorized = await fetchCoachAuthorization(session)
    expect(authorized).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('is_avaren_coach')
  })
})
