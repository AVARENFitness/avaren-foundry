import { describe, expect, it } from 'vitest'
import { coachBackend } from './coachBackend'
import {
  RECURRENCE_SERIES_TABLE_PRIVILEGES,
  assertRecurrenceAssignmentOwnership,
} from './recurringAppointmentSecurity'

describe('recurringAppointmentSecurity', () => {
  it('documents authenticated SELECT-only access on coach_appointment_series', () => {
    expect(RECURRENCE_SERIES_TABLE_PRIVILEGES.authenticated).toEqual(['select'])
    expect(RECURRENCE_SERIES_TABLE_PRIVILEGES.authenticated).not.toContain('insert')
    expect(RECURRENCE_SERIES_TABLE_PRIVILEGES.authenticated).not.toContain('update')
    expect(RECURRENCE_SERIES_TABLE_PRIVILEGES.authenticated).not.toContain('delete')
  })

  it('does not expose direct recurrence series table writes in coachBackend', () => {
    expect(coachBackend.createRecurringAppointmentSeries).toBeTypeOf('function')
    expect(coachBackend.updateRecurringAppointmentSeriesFuture).toBeTypeOf('function')
    expect(coachBackend.insertCoachAppointmentSeries).toBeUndefined()
    expect(coachBackend.updateCoachAppointmentSeries).toBeUndefined()
  })

  it('rejects cross-coach assignment references during series creation validation', () => {
    expect(() =>
      assertRecurrenceAssignmentOwnership({
        assignmentCoachId: 'coach-b',
        callerCoachId: 'coach-a',
        linkedAthleteUserId: 'athlete-1',
        assignmentAthleteId: 'athlete-1',
      }),
    ).toThrow(/appointment_invalid_assignment/)

    expect(() =>
      assertRecurrenceAssignmentOwnership({
        assignmentCoachId: 'coach-a',
        callerCoachId: 'coach-a',
        linkedAthleteUserId: 'athlete-1',
        assignmentAthleteId: 'athlete-2',
      }),
    ).toThrow(/appointment_invalid_assignment/)
  })

  it('allows assignment ownership when coach and athlete match the business client', () => {
    expect(() =>
      assertRecurrenceAssignmentOwnership({
        assignmentCoachId: 'coach-a',
        callerCoachId: 'coach-a',
        linkedAthleteUserId: 'athlete-1',
        assignmentAthleteId: 'athlete-1',
      }),
    ).not.toThrow()
  })
})
