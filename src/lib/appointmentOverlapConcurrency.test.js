import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findOverlappingAppointment, mapAppointmentOverlapError } from './coachingAppointment'
import {
  RECURRENCE_CONFLICT_STATUS,
  recordRecurrenceConflict,
  simulateInRunOccurrenceLimitMaterialization,
} from './recurringHorizonConflicts'
import { countLifetimeOccurrenceSlots } from './recurringAppointments'
import {
  APPOINTMENT_OVERLAP_EXCLUSION_SQLSTATE,
  APPOINTMENT_OVERLAP_MESSAGE,
  APPOINTMENT_OVERLAP_SQLSTATE,
  appointmentsOverlap,
  assertNoScheduleOverlap,
  isAppointmentOverlapError,
  simulateAtomicMaterialization,
  simulateConcurrentScheduleWrites,
} from './recurringMaterializeIsolation'
import {
  shouldCreateAthleteScheduledNotification,
} from './appointmentNotifications'
import { shouldSuppressOccurrenceScheduledNotification } from './appointmentSeriesNotifications'

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    'docs/supabase/AVAREN_RECURRING_APPOINTMENTS_8_14B_MIGRATION.sql',
  ),
  'utf8',
)

const scheduled = ({
  id,
  coachId = 'coach-1',
  startsAt,
  endsAt,
  status = 'scheduled',
  recurrenceSeriesId = null,
}) => ({
  id,
  coachId,
  startsAt,
  endsAt,
  status,
  recurrenceSeriesId,
})

describe('appointmentOverlapConcurrency', () => {
  it('prevents occurrence 21 when 19 existing slots and the 20th conflicts in-run', () => {
    const result = simulateInRunOccurrenceLimitMaterialization({
      existingSlotCount: 19,
      occurrenceLimit: 20,
      occurrenceDates: ['2026-10-07', '2026-10-14'],
      conflictingDates: ['2026-10-07'],
    })

    expect(result.conflicts).toBe(1)
    expect(result.created).toBe(0)
    expect(result.vOccurrenceSlots).toBe(20)
    expect(result.occurrenceDates).toEqual([])
  })

  it('increments in-run occurrence slots exactly once for a new conflict', () => {
    const first = simulateInRunOccurrenceLimitMaterialization({
      existingSlotCount: 19,
      occurrenceLimit: 20,
      occurrenceDates: ['2026-10-07'],
      conflictingDates: ['2026-10-07'],
    })
    const second = simulateInRunOccurrenceLimitMaterialization({
      existingSlotCount: first.vOccurrenceSlots,
      occurrenceLimit: 20,
      occurrenceDates: ['2026-10-07', '2026-10-14'],
      conflictingDates: ['2026-10-07'],
      initialConflictRecords: first.conflictRecords,
    })

    expect(first.vOccurrenceSlots).toBe(20)
    expect(second.conflicts).toBe(0)
    expect(second.created).toBe(0)
    expect(second.vOccurrenceSlots).toBe(20)
  })

  it('does not double increment when an existing conflict is retried', () => {
    const initial = recordRecurrenceConflict({
      seriesId: 'series-1',
      occurrenceDate: '2026-10-07',
      conflictRecords: [],
    })

    const rerun = simulateInRunOccurrenceLimitMaterialization({
      existingSlotCount: 20,
      occurrenceLimit: 20,
      occurrenceDates: ['2026-10-07'],
      conflictingDates: ['2026-10-07'],
      initialConflictRecords: initial.conflictRecords,
    })

    expect(rerun.conflicts).toBe(0)
    expect(rerun.vOccurrenceSlots).toBe(20)
  })

  it('counts a concrete appointment and resolved conflict date once', () => {
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

  it('rejects two concurrent overlapping one-off appointments', () => {
    const { results, ledger } = simulateConcurrentScheduleWrites({
      existingAppointments: [],
      writers: [
        {
          id: 'a',
          candidate: scheduled({
            id: 'a',
            startsAt: '2026-10-07T20:00:00.000Z',
            endsAt: '2026-10-07T21:00:00.000Z',
          }),
        },
        {
          id: 'b',
          candidate: scheduled({
            id: 'b',
            startsAt: '2026-10-07T20:30:00.000Z',
            endsAt: '2026-10-07T21:30:00.000Z',
          }),
        },
      ],
    })

    expect(results.filter((entry) => entry.ok)).toHaveLength(1)
    expect(results.find((entry) => !entry.ok)?.sqlState).toBe(
      APPOINTMENT_OVERLAP_EXCLUSION_SQLSTATE,
    )
    expect(ledger).toHaveLength(1)
  })

  it('rejects two concurrent overlapping recurrence materializations', () => {
    const { results } = simulateConcurrentScheduleWrites({
      existingAppointments: [
        scheduled({
          id: 'sarah',
          startsAt: '2026-10-07T20:00:00.000Z',
          endsAt: '2026-10-07T21:00:00.000Z',
        }),
      ],
      writers: [
        {
          id: 'jake',
          candidate: scheduled({
            id: 'jake',
            recurrenceSeriesId: 'series-jake',
            startsAt: '2026-10-07T20:30:00.000Z',
            endsAt: '2026-10-07T21:30:00.000Z',
          }),
        },
      ],
    })

    expect(results[0].ok).toBe(false)
    expect(isAppointmentOverlapError(results[0])).toBe(true)
  })

  it('maps exclusion constraint conflicts to normal appointment overlap UX', () => {
    expect(
      mapAppointmentOverlapError({
        code: APPOINTMENT_OVERLAP_EXCLUSION_SQLSTATE,
        message:
          'conflicting key value violates exclusion constraint "coach_scheduled_sessions_no_overlap"',
      })?.error,
    ).toBe('appointment_overlap')

    expect(
      mapAppointmentOverlapError({
        message: APPOINTMENT_OVERLAP_MESSAGE,
        code: APPOINTMENT_OVERLAP_SQLSTATE,
      })?.message,
    ).toContain('overlaps another in-person appointment')
  })

  it('rolls back initial recurring create entirely on concurrency conflict', () => {
    expect(() =>
      simulateAtomicMaterialization({
        occurrenceDates: ['2026-10-07', '2026-10-14'],
        conflictingDates: ['2026-10-07'],
      }),
    ).toThrow(APPOINTMENT_OVERLAP_MESSAGE)
  })

  it('allows back-to-back appointments for the same coach', () => {
    const first = scheduled({
      id: 'a',
      startsAt: '2026-10-07T20:00:00.000Z',
      endsAt: '2026-10-07T21:00:00.000Z',
    })
    const second = scheduled({
      id: 'b',
      startsAt: '2026-10-07T21:00:00.000Z',
      endsAt: '2026-10-07T22:00:00.000Z',
    })

    expect(appointmentsOverlap(first, second)).toBe(false)
    expect(() =>
      assertNoScheduleOverlap({
        existingAppointments: [first],
        candidate: second,
      }),
    ).not.toThrow()
  })

  it('allows different coaches to overlap in time', () => {
    expect(
      appointmentsOverlap(
        scheduled({
          id: 'a',
          coachId: 'coach-a',
          startsAt: '2026-10-07T20:00:00.000Z',
          endsAt: '2026-10-07T21:00:00.000Z',
        }),
        scheduled({
          id: 'b',
          coachId: 'coach-b',
          startsAt: '2026-10-07T20:30:00.000Z',
          endsAt: '2026-10-07T21:30:00.000Z',
        }),
      ),
    ).toBe(false)
  })

  it('does not treat cancelled appointments as blocking scheduled slots', () => {
    expect(
      appointmentsOverlap(
        scheduled({
          id: 'cancelled',
          status: 'cancelled',
          startsAt: '2026-10-07T20:00:00.000Z',
          endsAt: '2026-10-07T21:00:00.000Z',
        }),
        scheduled({
          id: 'next',
          startsAt: '2026-10-07T20:30:00.000Z',
          endsAt: '2026-10-07T21:30:00.000Z',
        }),
      ),
    ).toBe(false)
  })

  it('rejects rescheduling into an occupied time', () => {
    const existing = [
      scheduled({
        id: 'existing',
        startsAt: '2026-10-07T20:00:00.000Z',
        endsAt: '2026-10-07T21:00:00.000Z',
      }),
    ]
    const candidate = scheduled({
      id: 'moving',
      startsAt: '2026-10-07T20:30:00.000Z',
      endsAt: '2026-10-07T21:30:00.000Z',
    })

    expect(
      findOverlappingAppointment(candidate, existing, { excludeId: 'moving' }),
    ).toBeTruthy()
    expect(() =>
      assertNoScheduleOverlap({
        existingAppointments: existing,
        candidate,
        excludeId: 'moving',
      }),
    ).toThrow(/exclusion constraint/)
  })

  it('keeps one-off scheduled notification behavior unchanged', () => {
    expect(
      shouldCreateAthleteScheduledNotification({
        appointment: {
          id: 'appt-1',
          status: 'scheduled',
          athleteId: 'athlete-1',
          coachId: 'coach-1',
        },
        isInsert: true,
      }),
    ).toBe(true)
  })

  it('keeps recurrence materialization notification suppression unchanged', () => {
    expect(
      shouldSuppressOccurrenceScheduledNotification({
        recurrenceSeriesId: 'series-jake',
      }),
    ).toBe(true)
  })

  it('persists exclusion constraint, trigger, and dual overlap handling in migration SQL', () => {
    expect(migrationSql).toContain('create extension if not exists btree_gist')
    expect(migrationSql).toContain('coach_scheduled_sessions_no_overlap')
    expect(migrationSql).toContain("tstzrange(starts_at, ends_at, '[)')")
    expect(migrationSql).toContain('create trigger coach_scheduled_sessions_overlap_guard')
    expect(migrationSql).toContain("'99001', '23P01'")
    expect(migrationSql).toContain('v_occurrence_slots := v_occurrence_slots + 1')
  })
})
