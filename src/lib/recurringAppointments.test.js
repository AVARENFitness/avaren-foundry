import { describe, expect, it } from 'vitest'
import {
  RECURRENCE_END,
  RECURRENCE_HORIZON_WEEKS,
  RECURRENCE_MODE,
  RECURRENCE_SCOPE,
  HORIZON_EXTENSION_THRESHOLD_DAYS,
  WEEKDAY,
  assertRecurrencePreflightCoachAccess,
  buildRecurrenceOccurrenceKey,
  buildThisAndFutureSchedulePatch,
  canApplyThisAndFutureScheduleChange,
  computeHorizonExtensionTargetKey,
  computeMaterializationEndKey,
  countLifetimeOccurrenceSlots,
  countMaterializedOccurrences,
  formatRecurrenceScheduleLabel,
  formatRecurrenceWeekdayList,
  generateRecurrenceOccurrenceDates,
  identifySeriesNeedingHorizonExtension,
  identifySeriesForDailyRecurrenceWorker,
  materializeRecurrenceOccurrences,
  normalizeRecurrenceWeekdays,
  partitionEligibleFutureOccurrences,
  preflightRecurrenceConflicts,
  preserveHistoricalOccurrences,
  resolveRecurrenceWeekdays,
  validateRecurrenceDraft,
  validateRecurrenceSeriesInput,
  weekdayFromDateKey,
} from './recurringAppointments'
import { buildStartsAtIso } from './sessionTimezone'

describe('recurringAppointments', () => {
  it('creates weekly recurrence on the start weekday', () => {
    expect(
      resolveRecurrenceWeekdays({
        mode: RECURRENCE_MODE.WEEKLY,
        startsOn: '2026-08-17',
      }),
    ).toEqual([WEEKDAY.MON])
  })

  it('creates custom Mon/Wed/Fri recurrence', () => {
    expect(
      resolveRecurrenceWeekdays({
        mode: RECURRENCE_MODE.CUSTOM,
        weekdays: [WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI],
      }),
    ).toEqual([WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI])
  })

  it('materializes concrete occurrence dates within a 12-week horizon', () => {
    const dates = generateRecurrenceOccurrenceDates({
      startsOn: '2026-08-17',
      weekdays: [WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI],
      endsOn: '2026-11-13',
    })

    expect(dates[0]).toBe('2026-08-17')
    expect(dates.at(-1)).toBe('2026-11-09')
    expect(
      computeMaterializationEndKey({
        startsOn: '2026-08-17',
        endsOn: '2027-01-01',
      }),
    ).toBe('2026-11-09')
  })

  it('respects occurrence count end conditions', () => {
    const dates = generateRecurrenceOccurrenceDates({
      startsOn: '2026-08-17',
      weekdays: [WEEKDAY.MON],
      occurrenceLimit: 4,
    })

    expect(dates).toHaveLength(4)
  })

  it('materializes occurrences idempotently without duplicates', () => {
    const first = materializeRecurrenceOccurrences({
      seriesId: 'series-1',
      startsOn: '2026-08-17',
      startTime: '16:00',
      weekdays: [WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI],
      endsOn: '2026-09-01',
    })

    const second = materializeRecurrenceOccurrences({
      seriesId: 'series-1',
      startsOn: '2026-08-17',
      startTime: '16:00',
      weekdays: [WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI],
      endsOn: '2026-09-01',
      existingOccurrences: first,
    })

    expect(first.length).toBeGreaterThan(0)
    expect(second).toHaveLength(0)
  })

  it('preserves local 4 PM wall-clock time across DST', () => {
    const summer = buildStartsAtIso('2026-07-06', '16:00', 'America/New_York')
    const winter = buildStartsAtIso('2026-12-07', '16:00', 'America/New_York')

    expect(new Date(summer).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    })).toBe('4:00 PM')
    expect(new Date(winter).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    })).toBe('4:00 PM')
  })

  it('keeps one-off exceptions out of rematerialization', () => {
    const created = materializeRecurrenceOccurrences({
      seriesId: 'series-1',
      startsOn: '2026-08-17',
      startTime: '16:00',
      weekdays: [WEEKDAY.MON],
      endsOn: '2026-09-07',
      exceptionDates: ['2026-08-24'],
    })

    expect(created.some((row) => row.sessionDate === '2026-08-24')).toBe(false)
    expect(created.some((row) => row.sessionDate === '2026-08-17')).toBe(true)
  })

  it('partitions future editable occurrences without touching history', () => {
    const sessions = [
      {
        id: 'past',
        recurrenceSeriesId: 'series-1',
        sessionDate: '2026-08-10',
        status: 'completed',
      },
      {
        id: 'future',
        recurrenceSeriesId: 'series-1',
        sessionDate: '2026-08-24',
        status: 'scheduled',
      },
    ]

    expect(
      preserveHistoricalOccurrences({
        sessions,
        seriesId: 'series-1',
        effectiveDate: '2026-08-24',
      }).map((row) => row.id),
    ).toEqual(['past'])

    expect(
      partitionEligibleFutureOccurrences({
        sessions,
        seriesId: 'series-1',
        effectiveDate: '2026-08-24',
      }).map((row) => row.id),
    ).toEqual(['future'])
  })

  it('formats concise weekday labels for series notifications', () => {
    expect(
      formatRecurrenceWeekdayList([WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI]),
    ).toBe('Mon, Wed, Fri')

    expect(
      formatRecurrenceScheduleLabel({
        weekdays: [WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI],
        startTime: '16:00',
      }),
    ).toMatch(/Mon, Wed, Fri at 4:00 PM/)
  })

  it('validates recurrence draft end conditions', () => {
    expect(
      validateRecurrenceDraft(
        {
          enabled: true,
          mode: RECURRENCE_MODE.CUSTOM,
          weekdays: [WEEKDAY.MON],
          endType: RECURRENCE_END.ON_DATE,
          endsOn: '2026-11-13',
        },
        '2026-08-17',
      ),
    ).toBeNull()
  })

  it('uses deterministic occurrence identity', () => {
    expect(buildRecurrenceOccurrenceKey('series-1', '2026-08-17')).toBe(
      'series-1:2026-08-17',
    )
    expect(weekdayFromDateKey('2026-08-17')).toBe(WEEKDAY.MON)
    expect(RECURRENCE_HORIZON_WEEKS).toBe(12)
    expect(RECURRENCE_SCOPE.THIS_ONLY).toBe('this_only')
  })

  it('identifies active series nearing the rolling horizon', () => {
    const target = computeHorizonExtensionTargetKey({
      todayKey: '2026-08-17',
      horizonWeeks: 12,
      thresholdDays: HORIZON_EXTENSION_THRESHOLD_DAYS,
    })

    expect(target).toBe('2026-10-26')

    const needing = identifySeriesNeedingHorizonExtension({
      todayKey: '2026-08-17',
      series: [
        { id: 'series-1', status: 'active', materializedThrough: '2026-10-01' },
        { id: 'series-2', status: 'cancelled', materializedThrough: '2026-08-01' },
        { id: 'series-3', status: 'active', materializedThrough: '2026-11-10' },
      ],
      sessions: [],
    })

    expect(needing.map((row) => row.id)).toEqual(['series-1'])
  })

  it('extends materialization idempotently without duplicate occurrences', () => {
    const first = materializeRecurrenceOccurrences({
      seriesId: 'series-1',
      startsOn: '2026-08-17',
      startTime: '16:00',
      weekdays: [WEEKDAY.MON],
      endsOn: '2026-09-07',
    })

    const second = materializeRecurrenceOccurrences({
      seriesId: 'series-1',
      startsOn: '2026-08-17',
      startTime: '16:00',
      weekdays: [WEEKDAY.MON],
      endsOn: '2026-09-07',
      existingOccurrences: first,
    })

    expect(first.length).toBeGreaterThan(0)
    expect(second).toHaveLength(0)
  })

  it('respects occurrence_limit when counting lifetime occurrence slots', () => {
    const sessions = [
      { recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: '2026-08-10', status: 'completed' },
      { recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: '2026-08-17', status: 'scheduled' },
      { recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: '2026-08-17', status: 'cancelled' },
    ]
    const conflictRecords = [
      {
        seriesId: 'series-1',
        occurrenceDate: '2026-08-24',
        status: 'unresolved',
      },
    ]

    expect(countLifetimeOccurrenceSlots({ sessions, conflictRecords, seriesId: 'series-1' })).toBe(3)

    expect(
      identifySeriesForDailyRecurrenceWorker({
        todayKey: '2026-08-17',
        series: [{ id: 'series-1', status: 'active', occurrenceLimit: 3 }],
        sessions,
        conflictRecords,
      }),
    ).toHaveLength(1)
  })

  it('counts lifetime occurrence slots across completed, cancelled, and missed rows', () => {
    const sessions = [
      { recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: '2026-08-10', status: 'completed' },
      { recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: '2026-08-17', status: 'cancelled' },
      { recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: '2026-08-24', status: 'missed' },
      { recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: '2026-08-31', status: 'scheduled' },
    ]

    expect(countLifetimeOccurrenceSlots({ sessions, seriesId: 'series-1' })).toBe(4)
  })

  it('never simulates occurrence 21 when lifetime limit is 20', () => {
    const history = Array.from({ length: 15 }, (_, index) => ({
      recurrenceSeriesId: 'series-1',
      recurrenceOccurrenceDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
      status: index % 2 === 0 ? 'completed' : 'cancelled',
    }))

    const result = preflightRecurrenceConflicts({
      coachId: 'coach-1',
      callerCoachId: 'coach-1',
      startsOn: '2026-08-01',
      startTime: '16:00',
      durationMinutes: 60,
      weekdays: [WEEKDAY.MON],
      endsOn: '2026-12-31',
      occurrenceLimit: 20,
      effectiveFromDate: '2026-08-16',
      excludeSeriesId: 'series-1',
      existingSessions: history,
    })

    expect(result.hasConflicts).toBe(false)
    expect(result.simulatedOccurrences ?? 0).toBeLessThanOrEqual(5)
  })

  it('returns recurrence conflicts before create', () => {
    const result = preflightRecurrenceConflicts({
      coachId: 'coach-1',
      callerCoachId: 'coach-1',
      startsOn: '2026-08-17',
      startTime: '16:00',
      durationMinutes: 60,
      weekdays: [WEEKDAY.WED],
      endsOn: '2026-08-31',
      existingSessions: [
        {
          id: 'sarah-wed',
          coachId: 'coach-1',
          sessionDate: '2026-08-19',
          startTime: '16:00',
          durationMinutes: 60,
          status: 'scheduled',
          clientDisplayName: 'Sarah',
          startsAt: '2026-08-19T20:00:00.000Z',
          endsAt: '2026-08-19T21:00:00.000Z',
        },
      ],
    })

    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts[0].conflictingClientName).toBe('Sarah')
    expect(result.conflicts[0].occurrenceDate).toBe('2026-08-19')
  })

  it('allows non-conflicting recurrence to succeed in preflight', () => {
    const result = preflightRecurrenceConflicts({
      coachId: 'coach-1',
      callerCoachId: 'coach-1',
      startsOn: '2026-08-17',
      startTime: '16:00',
      durationMinutes: 60,
      weekdays: [WEEKDAY.MON],
      endsOn: '2026-08-31',
      existingSessions: [
        {
          id: 'sarah-wed',
          coachId: 'coach-1',
          sessionDate: '2026-08-19',
          startTime: '16:00',
          durationMinutes: 60,
          status: 'scheduled',
          startsAt: '2026-08-19T20:00:00.000Z',
          endsAt: '2026-08-19T21:00:00.000Z',
        },
      ],
    })

    expect(result.hasConflicts).toBe(false)
  })

  it('excludes the current series when preflighting this-and-future updates', () => {
    const result = preflightRecurrenceConflicts({
      coachId: 'coach-1',
      callerCoachId: 'coach-1',
      startsOn: '2026-08-17',
      startTime: '17:00',
      durationMinutes: 60,
      weekdays: [WEEKDAY.WED],
      endsOn: '2026-08-31',
      effectiveFromDate: '2026-08-24',
      excludeSeriesId: 'series-jake',
      existingSessions: [
        {
          id: 'jake-wed',
          coachId: 'coach-1',
          recurrenceSeriesId: 'series-jake',
          sessionDate: '2026-08-26',
          startTime: '16:00',
          durationMinutes: 60,
          status: 'scheduled',
          startsAt: '2026-08-26T20:00:00.000Z',
          endsAt: '2026-08-26T21:00:00.000Z',
        },
      ],
    })

    expect(result.hasConflicts).toBe(false)
  })

  it('rejects cross-coach preflight access', () => {
    expect(() =>
      preflightRecurrenceConflicts({
        coachId: 'coach-b',
        callerCoachId: 'coach-a',
        startsOn: '2026-08-17',
        weekdays: [WEEKDAY.MON],
        existingSessions: [],
      }),
    ).toThrow(/recurrence_preflight_forbidden/)
  })

  it('validates ends_on and weekday inputs', () => {
    expect(
      validateRecurrenceSeriesInput({
        startsOn: '2026-08-17',
        endsOn: '2026-08-10',
        weekdays: [WEEKDAY.MON],
      }),
    ).toBe('recurrence_invalid_end_date')

    expect(
      validateRecurrenceSeriesInput({
        startsOn: '2026-08-17',
        weekdays: [9],
      }),
    ).toBe('recurrence_invalid_weekdays')

    expect(normalizeRecurrenceWeekdays([WEEKDAY.FRI, WEEKDAY.MON, WEEKDAY.MON])).toEqual([
      WEEKDAY.MON,
      WEEKDAY.FRI,
    ])
  })

  it('blocks unsupported this-and-future date shifts', () => {
    expect(
      canApplyThisAndFutureScheduleChange({
        originalSessionDate: '2026-08-17',
        nextSessionDate: '2026-08-24',
      }),
    ).toBe(false)

    expect(
      buildThisAndFutureSchedulePatch({
        originalSessionDate: '2026-08-17',
        startTime: '17:00',
        durationMinutes: 45,
      }),
    ).toEqual({
      sessionDate: '2026-08-17',
      startTime: '17:00',
      durationMinutes: 45,
    })
  })
})
