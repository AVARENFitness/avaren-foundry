import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  countLifetimeOccurrenceSlots,
  identifySeriesForDailyRecurrenceWorker,
  preflightRecurrenceConflicts,
} from './recurringAppointments'
import {
  RECURRENCE_CONFLICT_STATUS,
  isRecurrenceDateAccountedFor,
  recordRecurrenceConflict,
  resolveEligibleRecurrenceConflicts,
  simulateDailyRecurrenceWorker,
  simulateInRunOccurrenceLimitMaterialization,
  simulateIsolatedMaterializationWithConflicts,
} from './recurringHorizonConflicts'
import {
  APPOINTMENT_OVERLAP_MESSAGE,
  simulateAtomicMaterialization,
} from './recurringMaterializeIsolation'
import { shouldCreateAthleteScheduledNotification } from './appointmentNotifications'
import { shouldSuppressOccurrenceScheduledNotification } from './appointmentSeriesNotifications'

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    'docs/supabase/AVAREN_RECURRING_APPOINTMENTS_8_14B_MIGRATION.sql',
  ),
  'utf8',
)

describe('recurringHorizonConflicts', () => {
  it('counts 19 appointments plus 1 conflict as occurrence_limit 20', () => {
    const sessions = Array.from({ length: 19 }, (_, index) => ({
      recurrenceSeriesId: 'series-1',
      recurrenceOccurrenceDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
    }))
    const conflictRecords = [
      {
        seriesId: 'series-1',
        occurrenceDate: '2026-08-20',
        status: RECURRENCE_CONFLICT_STATUS.UNRESOLVED,
      },
    ]

    expect(
      countLifetimeOccurrenceSlots({ sessions, conflictRecords, seriesId: 'series-1' }),
    ).toBe(20)
  })

  it('does not materialize occurrence 21 when occurrence_limit is 20', () => {
    const existingOccurrenceDates = Array.from({ length: 19 }, (_, index) =>
      `2026-08-${String(index + 1).padStart(2, '0')}`,
    )
    const initialConflictRecords = [
      {
        seriesId: 'series-1',
        occurrenceDate: '2026-08-20',
        status: RECURRENCE_CONFLICT_STATUS.UNRESOLVED,
      },
    ]

    const result = simulateIsolatedMaterializationWithConflicts({
      seriesId: 'series-1',
      occurrenceDates: ['2026-08-21', '2026-08-22'],
      existingOccurrenceDates,
      initialConflictRecords,
      occurrenceLimit: 20,
    })

    expect(result.created).toBe(0)
    expect(result.occurrenceDates).toHaveLength(19)
  })

  it('still counts exactly 20 slots after resolving a conflict into an appointment', () => {
    const sessions = Array.from({ length: 19 }, (_, index) => ({
      recurrenceSeriesId: 'series-1',
      recurrenceOccurrenceDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
    }))
    const blocked = recordRecurrenceConflict({
      seriesId: 'series-1',
      occurrenceDate: '2026-08-20',
      conflictingSessionId: 'sarah-1',
      conflictRecords: [],
    })

    const resolved = resolveEligibleRecurrenceConflicts({
      seriesId: 'series-1',
      conflictRecords: blocked.conflictRecords,
      conflictingDates: [],
      existingOccurrenceDates: sessions.map((session) => session.recurrenceOccurrenceDate),
      occurrenceEndAtByDate: { '2026-08-20': '2026-08-20T21:00:00.000Z' },
      now: new Date('2026-08-19T12:00:00.000Z'),
    })

    expect(resolved.materialized).toBe(1)
    expect(
      countLifetimeOccurrenceSlots({
        sessions: [
          ...sessions,
          {
            recurrenceSeriesId: 'series-1',
            recurrenceOccurrenceDate: '2026-08-20',
          },
        ],
        conflictRecords: resolved.conflictRecords,
        seriesId: 'series-1',
      }),
    ).toBe(20)
  })

  it('does not double count a resolved conflict and its concrete appointment', () => {
    expect(
      countLifetimeOccurrenceSlots({
        sessions: [
          {
            recurrenceSeriesId: 'series-1',
            recurrenceOccurrenceDate: '2026-10-07',
          },
        ],
        conflictRecords: [
          {
            seriesId: 'series-1',
            occurrenceDate: '2026-10-07',
            status: RECURRENCE_CONFLICT_STATUS.RESOLVED,
          },
        ],
        seriesId: 'series-1',
      }),
    ).toBe(1)
  })

  it('counts waived conflicts toward occurrence_limit accounting', () => {
    expect(
      countLifetimeOccurrenceSlots({
        sessions: [],
        conflictRecords: [
          {
            seriesId: 'series-1',
            occurrenceDate: '2026-10-07',
            status: RECURRENCE_CONFLICT_STATUS.WAIVED,
          },
        ],
        seriesId: 'series-1',
      }),
    ).toBe(1)
  })

  it('prevents occurrence 21 in-run when the 20th slot is a new conflict', () => {
    const result = simulateInRunOccurrenceLimitMaterialization({
      existingSlotCount: 19,
      occurrenceLimit: 20,
      occurrenceDates: ['2026-10-07', '2026-10-14'],
      conflictingDates: ['2026-10-07'],
    })

    expect(result.vOccurrenceSlots).toBe(20)
    expect(result.created).toBe(0)
    expect(result.occurrenceDates).not.toContain('2026-10-14')
  })

  it('selects series with unresolved conflicts even when horizon is still far out', () => {
    const selected = identifySeriesForDailyRecurrenceWorker({
      todayKey: '2026-08-01',
      series: [
        {
          id: 'series-jake',
          status: 'active',
          materializedThrough: '2026-11-30',
        },
      ],
      sessions: [],
      conflictRecords: [
        {
          seriesId: 'series-jake',
          occurrenceDate: '2026-10-07',
          status: RECURRENCE_CONFLICT_STATUS.UNRESOLVED,
        },
      ],
    })

    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('series-jake')
  })

  it('materializes an eligible future occurrence on the next worker run after blocker removal', () => {
    const worker = simulateDailyRecurrenceWorker({
      todayKey: '2026-10-01',
      series: [
        {
          id: 'series-jake',
          status: 'active',
          materializedThrough: '2026-12-31',
          pendingOccurrenceDates: [],
        },
      ],
      conflictRecords: [
        {
          seriesId: 'series-jake',
          occurrenceDate: '2026-10-07',
          status: RECURRENCE_CONFLICT_STATUS.UNRESOLVED,
        },
      ],
      conflictingDatesBySeries: {
        'series-jake': [],
      },
      occurrenceEndAtBySeries: {
        'series-jake': {
          '2026-10-07': '2026-10-07T21:00:00.000Z',
        },
      },
      now: new Date('2026-10-06T12:00:00.000Z'),
    })

    expect(worker.conflictsMaterialized).toBe(1)
    expect(
      worker.sessions.some(
        (session) =>
          session.recurrenceSeriesId === 'series-jake' &&
          session.recurrenceOccurrenceDate === '2026-10-07',
      ),
    ).toBe(true)
    expect(worker.seriesExtended).toBe(0)
  })

  it('never schedules a past conflict when the blocker disappears later', () => {
    const resolved = resolveEligibleRecurrenceConflicts({
      seriesId: 'series-jake',
      conflictRecords: [
        {
          seriesId: 'series-jake',
          occurrenceDate: '2026-10-06',
          status: RECURRENCE_CONFLICT_STATUS.UNRESOLVED,
        },
      ],
      conflictingDates: [],
      occurrenceEndAtByDate: {
        '2026-10-06': '2026-10-06T21:00:00.000Z',
      },
      now: new Date('2026-10-07T12:00:00.000Z'),
    })

    expect(resolved.materialized).toBe(0)
    expect(resolved.waived).toBe(1)
    expect(resolved.occurrenceDates).not.toContain('2026-10-06')
    expect(resolved.conflictRecords[0].status).toBe(RECURRENCE_CONFLICT_STATUS.WAIVED)
  })

  it('does not emit appointment-scheduled notification spam during conflict-only resolution', () => {
    expect(
      shouldSuppressOccurrenceScheduledNotification({
        recurrenceSeriesId: 'series-jake',
      }),
    ).toBe(true)

    expect(
      shouldCreateAthleteScheduledNotification({
        appointment: {
          id: 'appt-1',
          status: 'scheduled',
          athleteId: 'athlete-1',
          coachId: 'coach-1',
          recurrenceSeriesId: 'series-jake',
        },
        isInsert: true,
      }),
    ).toBe(false)
  })

  it('keeps horizon materialization idempotent across reruns', () => {
    const first = recordRecurrenceConflict({
      seriesId: 'series-jake',
      occurrenceDate: '2026-10-07',
      conflictingSessionId: 'sarah-1',
      conflictRecords: [],
    })

    const second = recordRecurrenceConflict({
      seriesId: 'series-jake',
      occurrenceDate: '2026-10-07',
      conflictingSessionId: 'sarah-1',
      conflictRecords: first.conflictRecords,
    })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
  })

  it('keeps initial recurring-series creation all-or-nothing', () => {
    expect(() =>
      simulateAtomicMaterialization({
        occurrenceDates: ['2026-10-07', '2026-10-14'],
        conflictingDates: ['2026-10-07'],
      }),
    ).toThrow(APPOINTMENT_OVERLAP_MESSAGE)
  })

  it('creates explicit conflict truth and never hides unaccounted recurrence dates', () => {
    const result = simulateIsolatedMaterializationWithConflicts({
      occurrenceDates: ['2026-10-07', '2026-10-14'],
      conflictingDates: ['2026-10-07'],
      horizonEndDate: '2026-10-14',
    })

    expect(result.unaccountedDates).toEqual([])
    expect(
      isRecurrenceDateAccountedFor({
        occurrenceDate: '2026-10-07',
        existingOccurrenceDates: result.occurrenceDates,
        conflictRecords: result.conflictRecords,
      }),
    ).toBe(true)
  })

  it('includes conflict slots in this-and-future preflight accounting', () => {
    const result = preflightRecurrenceConflicts({
      coachId: 'coach-1',
      callerCoachId: 'coach-1',
      startsOn: '2026-07-01',
      startTime: '16:00',
      durationMinutes: 60,
      weekdays: [1],
      endsOn: '2026-12-31',
      occurrenceLimit: 20,
      effectiveFromDate: '2026-08-16',
      excludeSeriesId: 'series-1',
      existingSessions: Array.from({ length: 18 }, (_, index) => ({
        recurrenceSeriesId: 'series-1',
        recurrenceOccurrenceDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
      })),
      existingConflictRecords: [
        {
          seriesId: 'series-1',
          occurrenceDate: '2026-07-19',
          status: RECURRENCE_CONFLICT_STATUS.UNRESOLVED,
        },
      ],
    })

    expect(result.simulatedOccurrences ?? 0).toBeLessThanOrEqual(1)
  })

  it('persists 8.14B.5 accounting and worker semantics in migration SQL', () => {
    expect(migrationSql).toContain('coach_appointment_series_conflicts')
    expect(migrationSql).toMatch(/union[\s\S]*coach_appointment_series_conflicts/s)
    expect(migrationSql).toContain('seriesConflictChecked')
    expect(migrationSql).toContain('conflictsRemaining')
    expect(migrationSql).toContain("set status = 'waived'")
    expect(migrationSql).toContain('v_ends_at <= now()')
  })
})
