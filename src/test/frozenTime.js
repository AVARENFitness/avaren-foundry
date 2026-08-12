import { afterEach, beforeEach, vi } from 'vitest'

/** Stable coach-week anchor used across weekly-check-in and coach AVA tests. */
export const FROZEN_COACH_WEEK = new Date('2026-08-07T12:00:00.000Z')

export function installFrozenCoachWeek(
  date = FROZEN_COACH_WEEK,
  { advanceTime = true } = {},
) {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: advanceTime })
    vi.setSystemTime(date)
  })

  afterEach(() => {
    vi.useRealTimers()
  })
}
