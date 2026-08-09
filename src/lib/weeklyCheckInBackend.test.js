import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCoachWeekRange } from './weeklyReview'
import {
  resetWeeklyCheckInBackendCache,
  weeklyCheckInBackend,
} from './weeklyCheckInBackend'

const now = new Date('2026-08-07T12:00:00.000Z')
const weekRange = getCoachWeekRange(now)

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}))

vi.mock('./weeklyCheckInCapability', () => ({
  probeWeeklyCheckInCapability: vi.fn(async () => ({
    status: 'available',
    schemaAvailable: true,
  })),
  isWeeklyCheckInFeatureEnabled: vi.fn(() => true),
  isMissingWeeklyCheckInTable: vi.fn(() => false),
}))

import { supabase } from './supabase'

describe('weeklyCheckInBackend current-week cache', () => {
  beforeEach(() => {
    resetWeeklyCheckInBackendCache()
    vi.clearAllMocks()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'athlete-1' } },
      error: null,
    })
  })

  it('returns cached current-week submission immediately after upsert', async () => {
    const row = {
      athlete_id: 'athlete-1',
      week_start: weekRange.weekStart,
      week_end: weekRange.weekEnd,
      training_rating: 4,
      recovery_rating: 4,
      nutrition_rating: 4,
      pain_or_issue: 'no_issues',
      pain_note: '',
      weekly_win: '',
      coach_note: '',
      status: 'submitted',
      submitted_at: `${weekRange.weekStart}T18:00:00.000Z`,
      updated_at: `${weekRange.weekStart}T18:00:00.000Z`,
    }

    supabase.from.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })

    const saved = await weeklyCheckInBackend.submitWeeklyCheckIn({
      training_rating: 4,
      recovery_rating: 4,
      nutrition_rating: 4,
      pain_or_issue: 'no_issues',
    })

    expect(saved?.weekStart).toBe(weekRange.weekStart)

    const current = await weeklyCheckInBackend.getCurrentWeeklyCheckIn(now)
    expect(current?.weekStart).toBe(weekRange.weekStart)
    expect(current?.status).toBe('submitted')
  })
})
