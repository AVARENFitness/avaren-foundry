import { describe, expect, it } from 'vitest'
import { buildCoachDayAvailability, coachLocalClockTime, minutesToTime } from './coachCalendarAvailability'

const session = (startTime, durationMinutes, overrides = {}) => ({
  startTime,
  durationMinutes,
  status: 'scheduled',
  ...overrides,
})

describe('coach calendar availability', () => {
  it('merges adjacent and overlapping busy appointments without double-counting', () => {
    const result = buildCoachDayAvailability([
      session('09:00', 60),
      session('09:30', 60),
      session('10:30', 30),
    ], { startHour: 8, endHour: 12 })
    expect(result.occupiedMinutes).toBe(120)
    expect(result.gaps).toEqual([
      { startTime: '08:00', endTime: '09:00', durationMinutes: 60 },
      { startTime: '11:00', endTime: '12:00', durationMinutes: 60 },
    ])
  })

  it('counts private calendar blocks and not cancelled sessions', () => {
    const result = buildCoachDayAvailability([
      session('08:00', 60, { isAthletePrivateEvent: true }),
      session('09:00', 60, { isCoachPrivateEvent: true }),
      session('10:00', 60, { status: 'cancelled' }),
    ], { startHour: 8, endHour: 12 })
    expect(result.occupiedMinutes).toBe(120)
    expect(result.gaps).toEqual([
      { startTime: '10:00', endTime: '12:00', durationMinutes: 120 },
    ])
  })

  it('does not offer a gap shorter than a usable booking', () => {
    const result = buildCoachDayAvailability([
      session('08:00', 80),
      session('09:35', 60),
    ], { startHour: 8, endHour: 11, minimumGapMinutes: 30 })
    expect(result.gaps).toEqual([
      { startTime: '10:35', endTime: '11:00', durationMinutes: 25 },
    ].filter((gap) => gap.durationMinutes >= 30))
  })

  it('clips events to the view window and ignores invalid times', () => {
    const result = buildCoachDayAvailability([
      session('05:30', 90),
      session('20:30', 90),
      session('bad', 60),
    ], { startHour: 6, endHour: 21 })
    expect(result.occupiedMinutes).toBe(90)
    expect(result.gaps).toEqual([
      { startTime: '07:00', endTime: '20:30', durationMinutes: 810 },
    ])
    expect(minutesToTime(570)).toBe('09:30')
  })
  it('does not advertise gaps that have already passed today', () => {
    const result = buildCoachDayAvailability([
      session('08:00', 60),
      session('11:00', 60),
      session('15:00', 60),
    ], { startHour: 8, endHour: 18, notBeforeTime: '12:03' })

    expect(result.occupiedMinutes).toBe(180)
    expect(result.gaps).toEqual([
      { startTime: '12:05', endTime: '15:00', durationMinutes: 175 },
      { startTime: '16:00', endTime: '18:00', durationMinutes: 120 },
    ])
  })

  it('never offers expired slots after the scheduling window ends', () => {
    const result = buildCoachDayAvailability(
      [session('18:00', 60)],
      { startHour: 6, endHour: 21, notBeforeTime: '22:15' },
    )
    expect(result.gaps).toEqual([])
    expect(result.occupiedMinutes).toBe(60)
  })

  it('reads the coach clock in the session timezone even when the device differs', () => {
    expect(coachLocalClockTime(new Date('2026-11-13T17:07:00.000Z'), 'America/New_York')).toBe('12:07')
    expect(coachLocalClockTime(new Date('2026-11-13T17:07:00.000Z'), 'America/Los_Angeles')).toBe('09:07')
  })

})
