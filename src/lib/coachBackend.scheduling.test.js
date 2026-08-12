import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APPOINTMENT_LINKAGE_ERROR } from './coachBusinessClientLinkage'

const mockInsert = vi.fn()
const mockSingle = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'coach-1' } },
        error: null,
      }),
    },
    from: (table) => {
      if (table === 'coach_scheduled_sessions') {
        return {
          insert: mockInsert,
        }
      }
      return {}
    },
  },
}))

mockInsert.mockReturnValue({
  select: () => ({
    single: mockSingle,
  }),
})

describe('coachBackend.createScheduledSession linkage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    mockSingle.mockResolvedValue({
      data: {
        id: 'session-1',
        coach_id: 'coach-1',
        athlete_id: 'athlete-jake',
        business_client_id: 'bc-jake',
        status: 'scheduled',
      },
      error: null,
    })
  })

  it('writes business_client_id for connected clients', async () => {
    const { coachBackend } = await import('./coachBackend')
    vi.spyOn(coachBackend, 'resolveBusinessClientId').mockResolvedValue('bc-jake')

    await coachBackend.createScheduledSession({
      athleteId: 'athlete-jake',
      businessClientId: 'bc-jake',
      sessionDate: '2026-08-13',
      startTime: '09:00',
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        athlete_id: 'athlete-jake',
        business_client_id: 'bc-jake',
      }),
    )
  })

  it('blocks scheduling when business client linkage cannot be resolved', async () => {
    const { coachBackend } = await import('./coachBackend')
    vi.spyOn(coachBackend, 'resolveBusinessClientId').mockResolvedValue(null)

    await expect(
      coachBackend.createScheduledSession({
        athleteId: 'athlete-jake',
        sessionDate: '2026-08-13',
        startTime: '09:00',
      }),
    ).rejects.toThrow(APPOINTMENT_LINKAGE_ERROR)

    expect(mockInsert).not.toHaveBeenCalled()
  })
})
