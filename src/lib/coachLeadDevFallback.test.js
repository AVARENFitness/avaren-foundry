import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'coach-1' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({ data: null, error: { code: '42P01' } })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: null, error: { code: '42P01' } })),
        })),
      })),
    })),
    rpc: vi.fn(async () => ({ data: null, error: { code: '42883' } })),
  },
}))

describe('coachLeadDevFallback production safety', () => {
  beforeEach(async () => {
    vi.resetModules()
    const { resetDevCoachLeadStore } = await import('./coachBackend')
    resetDevCoachLeadStore()
  })

  it('uses dev fallback only in development builds', async () => {
    const { coachBackend } = await import('./coachBackend')
    const lead = await coachBackend.createCoachLead({ firstName: 'Taylor' })
    expect(lead.firstName).toBe('Taylor')
  })

  it('rejects missing backend in production builds', async () => {
    vi.stubEnv('DEV', false)
    vi.resetModules()

    const { coachBackend } = await import('./coachBackend')

    await expect(
      coachBackend.createCoachLead({ firstName: 'Taylor' }),
    ).rejects.toThrow(/not available yet/i)

    vi.unstubAllEnvs()
  })
})
