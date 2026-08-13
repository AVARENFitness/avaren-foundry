import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { getCoachWeekRange } from '../lib/weeklyReview'
import { WEEKLY_CHECK_IN_STATUS } from '../lib/weeklyCheckIn'
import { useWeeklyCheckInSession } from './useWeeklyCheckInSession'
import { resetWeeklyCheckInBackendCache } from '../lib/weeklyCheckInBackend'
import { FROZEN_COACH_WEEK, installFrozenCoachWeek } from '../test/frozenTime'

const now = FROZEN_COACH_WEEK
const weekRange = getCoachWeekRange(now)

installFrozenCoachWeek(now)

const submittedRecord = {
  athleteId: 'athlete-1',
  weekStart: weekRange.weekStart,
  weekEnd: weekRange.weekEnd,
  status: 'submitted',
  trainingRating: 4,
  recoveryRating: 4,
  nutritionRating: 4,
  submittedAt: `${weekRange.weekStart}T18:00:00.000Z`,
}

vi.mock('../lib/weeklyCheckInCapability', () => ({
  WEEKLY_CHECKIN_CAPABILITY_STATUS: {
    UNKNOWN: 'unknown',
    CHECKING: 'checking',
    AVAILABLE: 'available',
    UNAVAILABLE: 'unavailable',
    ERROR: 'error',
  },
  getWeeklyCheckInCapability: vi.fn(() => ({
    status: 'available',
    schemaAvailable: true,
    probedAt: Date.now(),
    source: 'test',
  })),
  isWeeklyCheckInFeatureEnabled: vi.fn(() => true),
  logWeeklyCheckInRuntimeDiagnostic: vi.fn(),
  probeWeeklyCheckInCapability: vi.fn(async () => ({
    status: 'available',
    schemaAvailable: true,
    probedAt: Date.now(),
    source: 'test',
  })),
}))

vi.mock('../lib/weeklyCheckInBackend', async () => {
  const actual = await vi.importActual('../lib/weeklyCheckInBackend')
  return {
    ...actual,
    weeklyCheckInBackend: {
      hasCoachRelationship: vi.fn(),
      getAthleteCoachingRequirements: vi.fn(),
      getCurrentWeeklyCheckIn: vi.fn(),
      submitWeeklyCheckIn: vi.fn(),
    },
  }
})

import { weeklyCheckInBackend } from '../lib/weeklyCheckInBackend'

describe('useWeeklyCheckInSession post-submit reconciliation', () => {
  beforeEach(() => {
    resetWeeklyCheckInBackendCache()
    vi.clearAllMocks()
    weeklyCheckInBackend.hasCoachRelationship.mockResolvedValue(true)
    weeklyCheckInBackend.getAthleteCoachingRequirements.mockResolvedValue({
      weekly_check_in: 'required',
    })
    weeklyCheckInBackend.getCurrentWeeklyCheckIn.mockResolvedValue(null)
    weeklyCheckInBackend.submitWeeklyCheckIn.mockResolvedValue(submittedRecord)
  })

  it('reconciles to submitted immediately after verified save without reload', async () => {
    const { result } = renderHook(() =>
      useWeeklyCheckInSession({
        userId: 'athlete-1',
        cloudReady: true,
        refreshKey: 0,
      }),
    )

    await waitFor(() => {
      expect(result.current.weeklyCheckInStatus?.status).toBe(
        WEEKLY_CHECK_IN_STATUS.OVERDUE,
      )
    })

    await act(async () => {
      await result.current.saveWeeklyCheckIn({
        training_rating: 4,
        recovery_rating: 4,
        nutrition_rating: 4,
        pain_or_issue: 'no_issues',
      })
    })

    expect(result.current.weeklyCheckInStatus?.status).toBe(
      WEEKLY_CHECK_IN_STATUS.SUBMITTED,
    )
    expect(result.current.weeklyCheckInStatus?.submitted).toBe(true)
    expect(
      result.current.weeklyCheckInRecord?.weekStart,
    ).toBe(weekRange.weekStart)
  })

  it('does not downgrade to due when a stale reload returns null after submit', async () => {
    weeklyCheckInBackend.getCurrentWeeklyCheckIn
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const { result, rerender } = renderHook(
      ({ refreshKey }) =>
        useWeeklyCheckInSession({
          userId: 'athlete-1',
          cloudReady: true,
          refreshKey,
        }),
      { initialProps: { refreshKey: 0 } },
    )

    await waitFor(() => {
      expect(result.current.weeklyCheckInStatus?.status).toBe(
        WEEKLY_CHECK_IN_STATUS.OVERDUE,
      )
    })

    await act(async () => {
      await result.current.saveWeeklyCheckIn({
        training_rating: 4,
        recovery_rating: 4,
        nutrition_rating: 4,
        pain_or_issue: 'no_issues',
      })
    })

    rerender({ refreshKey: 1 })

    await waitFor(() => {
      expect(weeklyCheckInBackend.getCurrentWeeklyCheckIn).toHaveBeenCalledTimes(2)
    })

    expect(result.current.weeklyCheckInStatus?.status).toBe(
      WEEKLY_CHECK_IN_STATUS.SUBMITTED,
    )
  })

  it('shows obligation when requirements RPC is required even without coach_clients row', async () => {
    weeklyCheckInBackend.hasCoachRelationship.mockResolvedValue(false)
    weeklyCheckInBackend.getAthleteCoachingRequirements.mockResolvedValue({
      weekly_check_in: 'required',
    })
    weeklyCheckInBackend.getCurrentWeeklyCheckIn.mockResolvedValue(null)

    const { result } = renderHook(() =>
      useWeeklyCheckInSession({
        userId: 'athlete-1',
        cloudReady: true,
        refreshKey: 0,
      }),
    )

    await waitFor(() => {
      expect(result.current.weeklyCheckInRequired).toBe(true)
      expect(result.current.weeklyCheckInStatus?.status).toBe(
        WEEKLY_CHECK_IN_STATUS.OVERDUE,
      )
    })
  })

  it('hides obligation when requirements RPC is not_required', async () => {
    weeklyCheckInBackend.getAthleteCoachingRequirements.mockResolvedValue({
      weekly_check_in: 'not_required',
    })

    const { result } = renderHook(() =>
      useWeeklyCheckInSession({
        userId: 'athlete-1',
        cloudReady: true,
        refreshKey: 0,
      }),
    )

    await waitFor(() => {
      expect(result.current.weeklyCheckInRequired).toBe(false)
      expect(result.current.weeklyCheckInStatus?.status).toBe(
        WEEKLY_CHECK_IN_STATUS.NOT_REQUIRED,
      )
    })
  })

  it('reconciles to due immediately after dev reset reconcile', async () => {
    weeklyCheckInBackend.getCurrentWeeklyCheckIn.mockResolvedValue(
      submittedRecord,
    )

    const { result } = renderHook(() =>
      useWeeklyCheckInSession({
        userId: 'athlete-1',
        cloudReady: true,
        refreshKey: 0,
      }),
    )

    await waitFor(() => {
      expect(result.current.weeklyCheckInStatus?.status).toBe(
        WEEKLY_CHECK_IN_STATUS.SUBMITTED,
      )
    })

    weeklyCheckInBackend.getCurrentWeeklyCheckIn.mockResolvedValue(null)

    await act(async () => {
      await result.current.reconcileWeeklyCheckInAfterReset()
    })

    expect(result.current.weeklyCheckInStatus?.status).toBe(
      WEEKLY_CHECK_IN_STATUS.OVERDUE,
    )
    expect(result.current.currentWeeklyCheckInState.due).toBe(true)
    expect(result.current.currentWeeklyCheckInState.submitted).toBe(false)
  })
})
