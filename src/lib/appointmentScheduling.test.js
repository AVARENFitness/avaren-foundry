import { describe, expect, it } from 'vitest'
import {
  DURATION_PRESETS,
  addDaysKey,
  buildScheduleTimeOptions,
  dateKey,
  filterAvailableTimeOptions,
  formatScheduleDateLabel,
  formatScheduleTimeRange,
  isScheduleTimeInPast,
  resolveDurationPresetOptions,
  resolveScheduleInstant,
  stripScheduleTimeSeconds,
} from './appointmentScheduling'
import {
  appointmentsOverlap,
  findOverlappingAppointment,
  formatAppointmentHomeWhen,
} from './coachingAppointment'
import { materializeRecurrenceOccurrences, WEEKDAY } from './recurringAppointments'
import { REMINDER_LEAD_MS } from './sessionReminders'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'

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

describe('flexible schedule time + duration', () => {
  it('exposes 30/45/60 duration presets only', () => {
    expect(DURATION_PRESETS).toEqual([30, 45, 60])
  })

  it('keeps legacy nonstandard durations visible until changed', () => {
    expect(resolveDurationPresetOptions(90)).toEqual([30, 45, 60, 90])
    expect(resolveDurationPresetOptions(45)).toEqual([30, 45, 60])
  })

  it('builds 5-minute start times including 4:00 / 4:05 / 4:35 / 11:55', () => {
    const options = buildScheduleTimeOptions({ startHour: 6, endHour: 21 })
    const values = options.map((option) => option.value)

    expect(values).toContain('16:00')
    expect(values).toContain('16:05')
    expect(values).toContain('16:35')
    expect(values).toContain('11:55')
    expect(values).not.toContain('16:07')
    expect(values.every((value) => /^\d{2}:\d{2}$/.test(value))).toBe(true)
  })

  it('strips seconds from native time values', () => {
    expect(stripScheduleTimeSeconds('16:35:00')).toBe('16:35')
    expect(stripScheduleTimeSeconds('4:05')).toBe('04:05')
    expect(stripScheduleTimeSeconds('')).toBe('')
  })

  it('derives end time for each duration preset', () => {
    expect(
      formatScheduleTimeRange({ startTime: '16:00', durationMinutes: 30 }),
    ).toBe('4:00 PM–4:30 PM')
    expect(
      formatScheduleTimeRange({ startTime: '16:00', durationMinutes: 45 }),
    ).toBe('4:00 PM–4:45 PM')
    expect(
      formatScheduleTimeRange({ startTime: '16:00', durationMinutes: 60 }),
    ).toBe('4:00 PM–5:00 PM')
  })

  it('maps 4:35 + 45 min to 5:20', () => {
    expect(
      formatScheduleTimeRange({ startTime: '16:35', durationMinutes: 45 }),
    ).toBe('4:35 PM–5:20 PM')
  })

  it('resolves create/edit instants for flexible start times', () => {
    const createInstant = resolveScheduleInstant({
      sessionDate: '2026-09-08',
      startTime: '16:35',
      scheduleTimezone: TZ,
    })
    const editInstant = resolveScheduleInstant({
      sessionDate: '2026-09-08',
      startTime: '16:35:00',
      scheduleTimezone: TZ,
    })

    expect(createInstant.startsAt).toBe(editInstant.startsAt)
    expect(createInstant.startsAt).toBeTruthy()
  })

  it('detects conflicts using exact flexible start/end windows', () => {
    const coachId = 'coach-1'
    const first = {
      id: 'a',
      coachId,
      status: 'scheduled',
      startsAt: resolveScheduleInstant({
        sessionDate: '2026-09-08',
        startTime: '16:35',
        scheduleTimezone: TZ,
      }).startsAt,
      durationMinutes: 45,
    }
    const overlapping = {
      id: 'b',
      coachId,
      status: 'scheduled',
      startsAt: resolveScheduleInstant({
        sessionDate: '2026-09-08',
        startTime: '17:00',
        scheduleTimezone: TZ,
      }).startsAt,
      durationMinutes: 30,
    }
    const adjacent = {
      id: 'c',
      coachId,
      status: 'scheduled',
      startsAt: resolveScheduleInstant({
        sessionDate: '2026-09-08',
        startTime: '17:20',
        scheduleTimezone: TZ,
      }).startsAt,
      durationMinutes: 30,
    }

    expect(appointmentsOverlap(first, overlapping)).toBe(true)
    expect(findOverlappingAppointment(overlapping, [first])?.id).toBe('a')
    expect(appointmentsOverlap(first, adjacent)).toBe(false)
  })

  it('keeps recurring occurrences on the exact flexible start + duration', () => {
    const occurrences = materializeRecurrenceOccurrences({
      startsOn: '2026-09-08',
      startTime: '16:35',
      durationMinutes: 45,
      scheduleTimezone: TZ,
      weekdays: [WEEKDAY.TUE],
      occurrenceLimit: 2,
    })

    expect(occurrences.length).toBeGreaterThan(0)
    expect(occurrences[0].startTime).toBe('16:35')
    expect(occurrences[0].durationMinutes).toBe(45)
    expect(
      formatScheduleTimeRange({
        startTime: occurrences[0].startTime,
        durationMinutes: occurrences[0].durationMinutes,
      }),
    ).toBe('4:35 PM–5:20 PM')
  })

  it('anchors reminders to the exact flexible start instant', () => {
    const { startsAt } = resolveScheduleInstant({
      sessionDate: '2026-09-08',
      startTime: '16:35',
      scheduleTimezone: TZ,
    })
    const fireAtMs = new Date(startsAt).getTime() - REMINDER_LEAD_MS
    const fireAt = new Date(fireAtMs)

    expect(
      new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(startsAt)),
    ).toMatch(/4:35/)
    expect(
      new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(fireAt),
    ).toMatch(/2:35/)
  })

  it('still loads historical non-5-minute labels safely', () => {
    expect(
      formatScheduleTimeRange({ startTime: '16:07', durationMinutes: 90 }),
    ).toBe('4:07 PM–5:37 PM')
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
