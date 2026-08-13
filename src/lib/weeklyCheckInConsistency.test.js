import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  CURRENT_WEEKLY_CHECK_IN_UI_STATUS,
  getWeeklyCheckInStatus,
  isWeeklyCheckInDue,
  resolveCurrentWeeklyCheckInState,
} from './weeklyCheckIn'
import { buildAvaDailyBriefing } from './avaIntelligence'
import { AVA_ACTION_TYPES } from './avaActions'
import {
  resetWeeklyCheckInBackendCache,
  weeklyCheckInBackend,
} from './weeklyCheckInBackend'
import { getCoachWeekRange } from './weeklyReview'

const now = new Date('2026-08-07T12:00:00.000Z')
const weekRange = getCoachWeekRange(now)

const capabilityAvailable = {
  status: 'available',
  schemaAvailable: true,
}

const dueStatus = getWeeklyCheckInStatus({
  hasCoach: true,
  submission: null,
  now,
})

const submittedStatus = getWeeklyCheckInStatus({
  hasCoach: true,
  submission: {
    athleteId: 'athlete-a',
    weekStart: weekRange.weekStart,
    weekEnd: weekRange.weekEnd,
    status: 'submitted',
    trainingRating: 4,
    recoveryRating: 4,
    nutritionRating: 4,
    submittedAt: `${weekRange.weekStart}T18:00:00.000Z`,
  },
  now,
})

describe('weekly check-in canonical state', () => {
  it('maps due, submitted, and loading consistently', () => {
    expect(
      resolveCurrentWeeklyCheckInState({
        capability: capabilityAvailable,
        status: dueStatus,
        loading: false,
        now,
      }).status,
    ).toBe(CURRENT_WEEKLY_CHECK_IN_UI_STATUS.OVERDUE)

    expect(
      resolveCurrentWeeklyCheckInState({
        capability: capabilityAvailable,
        status: submittedStatus,
        loading: false,
        now,
      }).status,
    ).toBe(CURRENT_WEEKLY_CHECK_IN_UI_STATUS.SUBMITTED)

    expect(
      resolveCurrentWeeklyCheckInState({
        capability: capabilityAvailable,
        status: null,
        loading: true,
        now,
      }).status,
    ).toBe(CURRENT_WEEKLY_CHECK_IN_UI_STATUS.LOADING)
  })

  it('does not mark weekly due while loading', () => {
    const loadingState = resolveCurrentWeeklyCheckInState({
      capability: capabilityAvailable,
      status: dueStatus,
      loading: true,
      now,
    })

    expect(loadingState.loading).toBe(true)
    expect(isWeeklyCheckInDue(loadingState)).toBe(false)
  })
})

describe('weekly check-in AVA and Home consistency', () => {
  const baseState = {
    history: [{ id: '1', date: weekRange.weekStart, name: 'Upper', sets: [] }],
    readiness: { entries: [] },
    program: { nextWorkout: { name: 'Chest + Back' } },
    weeklySchedule: {
      0: 'Rest',
      1: 'Chest + Back',
      2: 'Arms',
      3: 'Legs + Core',
      4: 'Chest + Back',
      5: 'Arms',
      6: 'Legs + Core',
    },
  }

  it('surfaces weekly AVA action and due state together when weekly is due', () => {
    const weeklyCheckInState = resolveCurrentWeeklyCheckInState({
      capability: capabilityAvailable,
      status: dueStatus,
      loading: false,
      now,
    })

    const briefing = buildAvaDailyBriefing(baseState, {
      now,
      assignments: [],
      weeklyCheckInState,
      weeklyCheckInRequired: true,
    })

    expect(isWeeklyCheckInDue(weeklyCheckInState)).toBe(true)
    expect(briefing.primaryAction?.type).toBe(AVA_ACTION_TYPES.CHECK_READINESS)
    expect(briefing.primaryAction?.label).toMatch(/today's readiness/i)
    expect(briefing.secondaryAction?.type).toBe(
      AVA_ACTION_TYPES.OPEN_WEEKLY_CHECKIN,
    )
  })

  it('uses weekly primary and no due flag when weekly is submitted', () => {
    const weeklyCheckInState = resolveCurrentWeeklyCheckInState({
      capability: capabilityAvailable,
      status: submittedStatus,
      loading: false,
      now,
    })

    const briefing = buildAvaDailyBriefing(
      {
        ...baseState,
        readiness: {
          entries: [
            {
              id: 'r1',
              date: now.toISOString().slice(0, 10),
              sleep: 4,
              energy: 4,
              soreness: 2,
              stress: 2,
            },
          ],
        },
      },
      {
        now,
        assignments: [],
        weeklyCheckInState,
        weeklyCheckInRequired: true,
      },
    )

    expect(isWeeklyCheckInDue(weeklyCheckInState)).toBe(false)
    expect(briefing.primaryAction?.type).not.toBe(
      AVA_ACTION_TYPES.OPEN_WEEKLY_CHECKIN,
    )
  })

  it('uses explicit daily readiness copy instead of generic check in', () => {
    const briefing = buildAvaDailyBriefing(baseState, {
      now,
      assignments: [],
      weeklyCheckInState: resolveCurrentWeeklyCheckInState({
        capability: capabilityAvailable,
        status: submittedStatus,
        loading: false,
        now,
      }),
    })

    expect(briefing.headline.toLowerCase()).toContain('readiness')
    expect(briefing.headline.toLowerCase()).not.toBe('check in')
  })
})

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

describe('weekly check-in multi-account cache scoping', () => {
  beforeEach(() => {
    resetWeeklyCheckInBackendCache()
    vi.clearAllMocks()
  })

  it('does not reuse account A submission cache for account B', async () => {
    const rowA = {
      athlete_id: 'athlete-a',
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

    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'athlete-a' } },
      error: null,
    })

    supabase.from.mockReturnValueOnce({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: rowA, error: null }),
        }),
      }),
    })

    await weeklyCheckInBackend.submitWeeklyCheckIn({
      training_rating: 4,
      recovery_rating: 4,
      nutrition_rating: 4,
      pain_or_issue: 'no_issues',
    })

    resetWeeklyCheckInBackendCache()

    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'athlete-b' } },
      error: null,
    })

    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })

    const accountBCurrent = await weeklyCheckInBackend.getCurrentWeeklyCheckIn(now)
    expect(accountBCurrent).toBeNull()
  })
})
