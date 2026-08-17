import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APPOINTMENT_OVERLAP_MESSAGE,
  APPOINTMENT_OVERLAP_SQLSTATE,
  isAppointmentOverlapError,
  materializeUsesSavepointIsolation,
  simulateAtomicMaterialization,
  simulateIsolatedMaterialization,
} from './recurringMaterializeIsolation'

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    'docs/supabase/AVAREN_RECURRING_APPOINTMENTS_8_14B_MIGRATION.sql',
  ),
  'utf8',
)

const materializeSection = migrationSql.slice(
  migrationSql.indexOf('create or replace function public.materialize_recurring_appointment_series'),
  migrationSql.indexOf('revoke all on function public.materialize_recurring_appointment_series'),
)

describe('recurringMaterializeIsolation', () => {
  it('uses nested exception subtransactions instead of explicit SAVEPOINT commands', () => {
    expect(materializeUsesSavepointIsolation(materializeSection)).toBe(false)
    expect(materializeSection).toContain("'99001', '23P01'")
    expect(materializeSection).toContain('if p_isolate_conflicts then')
    expect(materializeSection).toContain('begin')
    expect(materializeSection).toContain('exception')
  })

  it('recognizes trigger and exclusion overlap discriminators', () => {
    expect(
      isAppointmentOverlapError({
        sqlState: APPOINTMENT_OVERLAP_SQLSTATE,
      }),
    ).toBe(true)
    expect(
      isAppointmentOverlapError({
        sqlState: '23P01',
      }),
    ).toBe(true)
    expect(
      isAppointmentOverlapError({
        message: APPOINTMENT_OVERLAP_MESSAGE,
      }),
    ).toBe(true)
    expect(isAppointmentOverlapError({ sqlState: '23505' })).toBe(false)
  })

  it('continues materializing later dates after one conflicted horizon occurrence', () => {
    const result = simulateIsolatedMaterialization({
      occurrenceDates: ['2026-09-01', '2026-09-03', '2026-09-05'],
      conflictingDates: ['2026-09-03'],
    })

    expect(result.created).toBe(2)
    expect(result.conflicts).toBe(1)
  })

  it('does not count occurrence slots for conflicted isolated inserts', () => {
    const first = simulateIsolatedMaterialization({
      occurrenceDates: ['2026-09-01', '2026-09-03'],
      conflictingDates: ['2026-09-01'],
    })

    const second = simulateIsolatedMaterialization({
      occurrenceDates: ['2026-09-01', '2026-09-03'],
      existingDates: ['2026-09-03'],
      conflictingDates: ['2026-09-01'],
    })

    expect(first.created).toBe(1)
    expect(second.created).toBe(0)
    expect(second.conflicts).toBe(1)
  })

  it('fails the affected series on non-overlap errors during isolated materialization', () => {
    expect(() =>
      simulateIsolatedMaterialization({
        occurrenceDates: ['2026-09-01', '2026-09-03'],
        fatalErrorDate: '2026-09-03',
      }),
    ).toThrow(/materialize_series_failed/)
  })

  it('keeps initial recurrence creation all-or-nothing when isolation is disabled', () => {
    expect(() =>
      simulateAtomicMaterialization({
        occurrenceDates: ['2026-09-01', '2026-09-03', '2026-09-05'],
        conflictingDates: ['2026-09-03'],
      }),
    ).toThrow(APPOINTMENT_OVERLAP_MESSAGE)

    try {
      simulateAtomicMaterialization({
        occurrenceDates: ['2026-09-01', '2026-09-03', '2026-09-05'],
        conflictingDates: ['2026-09-03'],
      })
    } catch (error) {
      expect(error.sqlState).toBe(APPOINTMENT_OVERLAP_SQLSTATE)
    }

    expect(
      simulateAtomicMaterialization({
        occurrenceDates: ['2026-09-01', '2026-09-05'],
        conflictingDates: [],
      }).created,
    ).toBe(2)
  })
})
