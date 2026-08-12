import { describe, expect, it } from 'vitest'
import {
  addDaysKey,
  dateKey,
  filterAvailableTimeOptions,
  formatScheduleDateLabel,
  isScheduleTimeInPast,
  resolveScheduleInstant,
} from './appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'
import { formatAppointmentHomeWhen } from './coachingAppointment'

const TZ = DEFAULT_COACH_SCHEDULE_TIMEZONE

describe('appointmentScheduling', () => {
  const now = new Date('2026-08-09T23:30:00.000Z')

  it('labels today and tomorrow for quick date picks', () => {
    const today = dateKey(now, TZ)
    expect(formatScheduleDateLabel(today, now, TZ)).toBe('Today')
    expect(formatScheduleDateLabel(addDaysKey(today, 1), now, TZ)).toBe('Tomorrow')
  })

  it('uses America/New_York calendar day at late evening without UTC drift', () => {
    const lateEveningNy = new Date('2026-08-12T01:52:00.000Z')

    expect(dateKey(lateEveningNy, TZ)).toBe('2026-08-11')

    const today = dateKey(lateEveningNy, TZ)
    const tomorrow = addDaysKey(today, 1)

    expect(today).toBe('2026-08-11')
    expect(tomorrow).toBe('2026-08-12')
    expect(tomorrow).not.toBe('2026-08-13')
    expect(formatScheduleDateLabel(tomorrow, lateEveningNy, TZ)).toBe('Tomorrow')
  })

  it('preserves selected local date payload fields for timezone derivation', () => {
    const instant = resolveScheduleInstant({
      sessionDate: '2026-08-12',
      startTime: '09:00',
      scheduleTimezone: TZ,
    })

    expect(instant.startsAt).toBeTruthy()
    expect(new Date(instant.startsAt).getTime()).toBeGreaterThan(
      new Date('2026-08-12T01:52:00.000Z').getTime(),
    )
  })

  it('blocks past times on the current day', () => {
    const today = dateKey(now, TZ)
    expect(
      isScheduleTimeInPast({
        sessionDate: today,
        startTime: '09:00',
        now,
        scheduleTimezone: TZ,
      }),
    ).toBe(true)

    expect(
      isScheduleTimeInPast({
        sessionDate: addDaysKey(today, 1),
        startTime: '09:00',
        now,
        scheduleTimezone: TZ,
      }),
    ).toBe(false)
  })

  it('filters elapsed same-day slots from selectable options', () => {
    const today = dateKey(now, TZ)
    const options = [
      { value: '09:00', label: '9:00 AM' },
      { value: '23:45', label: '11:45 PM' },
    ]
    const available = filterAvailableTimeOptions(options, {
      sessionDate: today,
      now,
      scheduleTimezone: TZ,
    })

    expect(available.every((option) => option.value !== '09:00')).toBe(true)
    expect(available.length).toBeGreaterThan(0)
  })
})

describe('appointment home formatting', () => {
  it('shows Tomorrow for the next local calendar day at late evening', () => {
    const now = new Date('2026-08-12T01:52:00.000Z')
    const label = formatAppointmentHomeWhen(
      {
        sessionDate: '2026-08-12',
        startTime: '09:00',
        scheduleTimezone: TZ,
      },
      now,
    )

    expect(label).toMatch(/^Tomorrow · 9:00 AM/)
  })
})
