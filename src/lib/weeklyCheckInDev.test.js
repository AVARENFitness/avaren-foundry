import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCoachWeekRange } from './weeklyReview'
import {
  getWeeklyCheckInStatus,
  isWeeklyCheckInDue,
  resolveCurrentWeeklyCheckInState,
} from './weeklyCheckIn'
import {
  buildNotifications,
  NOTIFICATION_TYPES,
} from './notifications'
import {
  dismissNotification,
  markNotificationActedOn,
} from './notifications'
import {
  devResetCurrentWeeklyCheckIn,
  DEV_WEEKLY_CHECKIN_RESET_ERROR,
  restoreWeeklyCheckInNotifications,
  weeklyCheckInNotificationFingerprint,
} from './weeklyCheckInDev'
import {
  DEV_WEEKLY_CHECKIN_RESET_RPC,
  DEV_WEEKLY_CHECKIN_RESET_RPC_MISSING_MESSAGE,
  resetWeeklyCheckInBackendCache,
  weeklyCheckInBackend,
} from './weeklyCheckInBackend'
import { invalidateCoachPortfolioCache } from './coachPortfolioService'
import { FROZEN_COACH_WEEK, installFrozenCoachWeek } from '../test/frozenTime'

const now = FROZEN_COACH_WEEK
const weekRange = getCoachWeekRange(now)

installFrozenCoachWeek(now)

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
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

vi.mock('./coachPortfolioService', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    invalidateCoachPortfolioCache: vi.fn(),
  }
})

import { supabase } from './supabase'

const capabilityAvailable = {
  status: 'available',
  schemaAvailable: true,
}

const submittedRow = {
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

const createTableBuilder = (table, getRow, setRow) => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: submittedRow, error: null })),
    maybeSingle: vi.fn(async () => ({
      data: table === 'coach_clients' ? null : getRow(),
      error: null,
    })),
    then(onFulfilled, onRejected) {
      if (table === 'coach_clients') {
        return Promise.resolve({
          data: [{ coach_id: 'coach-1' }],
          error: null,
        }).then(onFulfilled, onRejected)
      }
      return Promise.resolve({ data: getRow(), error: null }).then(
        onFulfilled,
        onRejected,
      )
    },
  }
  return builder
}

describe('weeklyCheckInDev reset utility', () => {
  beforeEach(() => {
    resetWeeklyCheckInBackendCache()
    vi.clearAllMocks()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'athlete-1' } },
      error: null,
    })
  })

  it('refuses reset outside development builds', async () => {
    const dev = import.meta.env.DEV
    import.meta.env.DEV = false

    await expect(devResetCurrentWeeklyCheckIn(now)).rejects.toThrow(
      DEV_WEEKLY_CHECKIN_RESET_ERROR,
    )

    import.meta.env.DEV = dev
  })

  it('uses the scoped dev reset RPC instead of client delete', async () => {
    let currentRow = { id: 'row-1' }

    supabase.from.mockImplementation((table) =>
      createTableBuilder(
        table,
        () => currentRow,
        (row) => {
          currentRow = row
        },
      ),
    )
    supabase.rpc.mockResolvedValue({
      data: {
        week_start: weekRange.weekStart,
        week_end: weekRange.weekEnd,
        row_existed_before: true,
        rows_affected: 1,
        row_exists_after: false,
        deleted: true,
      },
      error: null,
    })

    const result = await weeklyCheckInBackend.resetCurrentWeekWeeklyCheckIn(now)

    expect(supabase.rpc).toHaveBeenCalledWith(DEV_WEEKLY_CHECKIN_RESET_RPC)
    expect(result).toEqual({
      deleted: true,
      weekStart: weekRange.weekStart,
      rowExistedBefore: true,
      rowExistsAfter: false,
      rowsAffected: 1,
      deleteBlockedByRls: false,
      rpcAvailable: true,
    })
  })

  it('reports RPC missing instead of false success', async () => {
    supabase.from.mockImplementation((table) =>
      createTableBuilder(table, () => ({ id: 'row-1' }), vi.fn()),
    )
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function does not exist' },
    })

    const result = await weeklyCheckInBackend.resetCurrentWeekWeeklyCheckIn(now)

    expect(result.rpcAvailable).toBe(false)
    expect(result.deleted).toBe(false)
    expect(result.errorMessage).toBe(
      DEV_WEEKLY_CHECKIN_RESET_RPC_MISSING_MESSAGE,
    )
  })

  it('reports failure when row still exists after reset attempt', async () => {
    supabase.from.mockImplementation((table) =>
      createTableBuilder(table, () => ({ id: 'row-1' }), vi.fn()),
    )
    supabase.rpc.mockResolvedValue({
      data: {
        week_start: weekRange.weekStart,
        week_end: weekRange.weekEnd,
        row_existed_before: true,
        rows_affected: 0,
        row_exists_after: true,
        deleted: false,
      },
      error: null,
    })

    const result = await weeklyCheckInBackend.resetCurrentWeekWeeklyCheckIn(now)

    expect(result.deleted).toBe(false)
    expect(result.rowExistsAfter).toBe(true)
    expect(result.deleteBlockedByRls).toBe(true)
  })

  it('moves submitted current week to due after dev reset', async () => {
    let currentRow = submittedRow

    supabase.from.mockImplementation((table) =>
      createTableBuilder(
        table,
        () => currentRow,
        (row) => {
          currentRow = row
        },
      ),
    )
    supabase.rpc.mockImplementation(async () => {
      const rowExistedBefore = Boolean(currentRow)
      currentRow = null
      return {
        data: {
          week_start: weekRange.weekStart,
          week_end: weekRange.weekEnd,
          row_existed_before: rowExistedBefore,
          rows_affected: rowExistedBefore ? 1 : 0,
          row_exists_after: false,
          deleted: rowExistedBefore,
        },
        error: null,
      }
    })

    const submittedState = resolveCurrentWeeklyCheckInState({
      capability: capabilityAvailable,
      status: getWeeklyCheckInStatus({
        hasCoach: true,
        submission: submittedRow,
        now,
      }),
      loading: false,
      now,
    })

    expect(isWeeklyCheckInDue(submittedState)).toBe(false)

    currentRow = submittedRow
    await devResetCurrentWeeklyCheckIn({ athleteId: 'athlete-1', now })

    expect(invalidateCoachPortfolioCache).toHaveBeenCalled()

    const dueStatus = getWeeklyCheckInStatus({
      hasCoach: true,
      submission: null,
      now,
    })
    const dueState = resolveCurrentWeeklyCheckInState({
      capability: capabilityAvailable,
      status: dueStatus,
      loading: false,
      now,
    })

    expect(isWeeklyCheckInDue(dueState)).toBe(true)
    expect(dueState.status).toBe('overdue')
  })

  it('restores weekly notification and Home due alignment after reset', () => {
    const fingerprint = weeklyCheckInNotificationFingerprint(weekRange.weekStart)
    const dueState = resolveCurrentWeeklyCheckInState({
      capability: capabilityAvailable,
      status: getWeeklyCheckInStatus({
        hasCoach: true,
        submission: null,
        now,
      }),
      loading: false,
      now,
    })

    let notificationState = { read: [], dismissed: [], actedOn: [] }
    notificationState = dismissNotification(notificationState, { fingerprint })
    notificationState = markNotificationActedOn(notificationState, { fingerprint })

    const restored = restoreWeeklyCheckInNotifications(
      notificationState,
      weekRange.weekStart,
    )

    const notifications = buildNotifications({
      history: [],
      readiness: { entries: [] },
      weeklyCheckInState: dueState,
      weeklyCheckInCapability: capabilityAvailable,
      notifications: restored,
    })

    expect(isWeeklyCheckInDue(dueState)).toBe(true)
    expect(
      notifications.some(
        (notification) =>
          notification.type === NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      ),
    ).toBe(true)
    expect(restored.dismissed).not.toContain(fingerprint)
    expect(restored.actedOn).not.toContain(fingerprint)
  })
})
