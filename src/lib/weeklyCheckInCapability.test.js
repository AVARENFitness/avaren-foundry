import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WEEKLY_CHECKIN_CAPABILITY_STATUS,
  isMissingWeeklyCheckInTable,
  probeWeeklyCheckInCapability,
  resetWeeklyCheckInCapabilityCache,
} from './weeklyCheckInCapability'

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from './supabase'

describe('weeklyCheckInCapability', () => {
  beforeEach(() => {
    resetWeeklyCheckInCapabilityCache()
    vi.clearAllMocks()
  })

  it('detects postgrest missing-table errors', () => {
    expect(
      isMissingWeeklyCheckInTable({
        code: 'PGRST205',
        message:
          "Could not find the table 'public.athlete_weekly_check_ins' in the schema cache",
      }),
    ).toBe(true)
    expect(
      isMissingWeeklyCheckInTable({
        code: '42P01',
        message: 'relation "athlete_weekly_check_ins" does not exist',
      }),
    ).toBe(true)
  })

  it('marks capability unavailable when the table is missing', async () => {
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'PGRST205',
            message:
              "Could not find the table 'public.athlete_weekly_check_ins' in the schema cache",
          },
        }),
      }),
    })

    const capability = await probeWeeklyCheckInCapability({ force: true })

    expect(capability.status).toBe(
      WEEKLY_CHECKIN_CAPABILITY_STATUS.UNAVAILABLE,
    )
    expect(capability.schemaAvailable).toBe(false)
  })

  it('marks capability available when the table responds', async () => {
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    })

    const capability = await probeWeeklyCheckInCapability({ force: true })

    expect(capability.status).toBe(
      WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE,
    )
    expect(capability.schemaAvailable).toBe(true)
  })
})
