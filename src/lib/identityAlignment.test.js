import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockAuthGetUser = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args) => mockAuthGetUser(...args),
    },
    from: (...args) => mockFrom(...args),
  },
}))

describe('coachClientLabelsBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'coach-1' } },
      error: null,
    })
  })

  it('writes coach_label only for authorized coach/client relationship', async () => {
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            coach_id: 'coach-1',
            athlete_id: 'athlete-1',
            coach_label: 'Jake',
          },
          error: null,
        }),
      }),
    })

    mockFrom.mockReturnValue({ upsert })

    const { coachClientLabelsBackend } = await import('./coachClientLabelsBackend')
    const saved = await coachClientLabelsBackend.upsertCoachLabel('athlete-1', 'Jake')

    expect(mockFrom).toHaveBeenCalledWith('coach_client_labels')
    expect(upsert).toHaveBeenCalledWith(
      {
        coach_id: 'coach-1',
        athlete_id: 'athlete-1',
        coach_label: 'Jake',
      },
      { onConflict: 'coach_id,athlete_id' },
    )
    expect(saved.coach_label).toBe('Jake')
    expect(saved).not.toHaveProperty('first_name')
  })

  it('returns null when coach_client_labels table is missing', async () => {
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '42P01', message: 'relation does not exist' },
          }),
        }),
      }),
    })

    const { coachClientLabelsBackend } = await import('./coachClientLabelsBackend')
    const saved = await coachClientLabelsBackend.upsertCoachLabel('athlete-1', 'Jake')

    expect(saved).toBeNull()
  })
})

describe('userProfileBackend upsert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'athlete-1' } },
      error: null,
    })
  })

  it('upserts own profile without coach_label fields', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })

    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle }),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            user_id: 'athlete-1',
            first_name: 'Jacob',
            last_name: 'Corell',
            preferred_name: 'Jacob',
            display_name: '',
          },
          error: null,
        }),
      }),
    })

    mockFrom.mockImplementation((table) => {
      if (table === 'user_profiles') {
        return { select, upsert }
      }
      return { select, upsert }
    })

    const { userProfileBackend } = await import('./userProfileBackend')
    const saved = await userProfileBackend.updateOwnUserProfile({
      first_name: 'Jacob',
      last_name: 'Corell',
      preferred_name: 'Jacob',
    })

    expect(saved.first_name).toBe('Jacob')
    expect(saved.last_name).toBe('Corell')
    expect(saved.preferred_name).toBe('Jacob')
    expect(upsert).toHaveBeenCalled()
    const payload = upsert.mock.calls[0][0]
    expect(payload).not.toHaveProperty('coach_label')
  })
})
