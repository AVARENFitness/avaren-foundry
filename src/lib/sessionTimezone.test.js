import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COACH_SCHEDULE_TIMEZONE,
  buildStartsAtIso,
  formatSessionInstantTime,
  resolveCoachScheduleTimezone,
  syncSessionWallClockFromStartsAt,
} from './sessionTimezone'

describe('sessionTimezone', () => {
  it('defaults coach scheduling to America/New_York', () => {
    expect(DEFAULT_COACH_SCHEDULE_TIMEZONE).toBe('America/New_York')
    expect(resolveCoachScheduleTimezone({})).toBe('America/New_York')
  })

  it('supports per-coach timezone overrides later', () => {
    expect(
      resolveCoachScheduleTimezone({
        scheduleTimezone: 'America/Los_Angeles',
      }),
    ).toBe('America/Los_Angeles')
  })

  it('builds starts_at from wall clock in America/New_York with DST', () => {
    const summer = buildStartsAtIso(
      '2026-08-07',
      '16:00',
      'America/New_York',
    )
    expect(summer).toBe('2026-08-07T20:00:00.000Z')

    const winter = buildStartsAtIso(
      '2026-01-15',
      '16:00',
      'America/New_York',
    )
    expect(winter).toBe('2026-01-15T21:00:00.000Z')
  })

  it('formats appointment time in the stored IANA timezone', () => {
    expect(
      formatSessionInstantTime(
        '2026-08-07T20:00:00.000Z',
        'America/New_York',
      ),
    ).toMatch(/4:00 PM/)
  })

  it('derives wall clock fields from starts_at for rescheduling', () => {
    const wall = syncSessionWallClockFromStartsAt(
      '2026-08-07T20:00:00.000Z',
      'America/New_York',
    )

    expect(wall.sessionDate).toBe('2026-08-07')
    expect(wall.startTime).toBe('16:00')
  })
})
