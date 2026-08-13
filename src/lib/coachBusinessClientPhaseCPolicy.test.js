import { describe, expect, it } from 'vitest'

/**
 * Phase C lifecycle policy contract (8.5.1).
 * Executable documentation — SQL behavior is defined in
 * AVAREN_COACH_BUSINESS_CLIENTS_8_5_PHASE_C_MIGRATION.sql
 */

export const PHASE_C_BRIDGE_STRATEGY = {
  model: 'active-access-only',
  deleteOn: ['unlink', 'end_coaching'],
  upsertOn: ['link', 'relink', 'invitation_accept', 'reopen_when_linked'],
}

export const PHASE_C_HISTORICAL_TRUTH_SOURCES = [
  'coach_business_clients',
  'coach_assignments',
  'coach_scheduled_sessions.business_client_id',
  'coach_client_pass_balances',
  'coach_client_pass_ledger',
  'coach_business_client_notes',
  'coach_weekly_reviews',
  'coach_client_followups',
  'foundry_local_workout_history',
]

export const shouldBackfillAppointmentAthleteId = ({
  status,
  sessionDate,
  coachLocalToday,
  currentAthleteId,
}) => {
  if (currentAthleteId != null) return false
  if (status !== 'scheduled') return false
  if (!sessionDate || !coachLocalToday) return false
  return sessionDate >= coachLocalToday
}

export const preservesHistoricalCoachingAfterUnlink = ({
  bridgeDeleted,
  assignmentsRemain,
  businessClientRemains,
  linkedUserIdCleared,
}) =>
  bridgeDeleted &&
  linkedUserIdCleared &&
  businessClientRemains &&
  assignmentsRemain

describe('coachBusinessClientPhaseCPolicy', () => {
  it('uses future-only athlete_id backfill on link', () => {
    expect(
      shouldBackfillAppointmentAthleteId({
        status: 'completed',
        sessionDate: '2026-08-10',
        coachLocalToday: '2026-08-13',
        currentAthleteId: null,
      }),
    ).toBe(false)

    expect(
      shouldBackfillAppointmentAthleteId({
        status: 'scheduled',
        sessionDate: '2026-08-10',
        coachLocalToday: '2026-08-13',
        currentAthleteId: null,
      }),
    ).toBe(false)

    expect(
      shouldBackfillAppointmentAthleteId({
        status: 'scheduled',
        sessionDate: '2026-08-14',
        coachLocalToday: '2026-08-13',
        currentAthleteId: null,
      }),
    ).toBe(true)
  })

  it('defines bridge as active access only (DELETE on unlink/end)', () => {
    expect(PHASE_C_BRIDGE_STRATEGY.deleteOn).toContain('unlink')
    expect(PHASE_C_BRIDGE_STRATEGY.deleteOn).toContain('end_coaching')
    expect(PHASE_C_HISTORICAL_TRUTH_SOURCES).not.toContain('coach_clients')
  })

  it('preserves was-coached truth after unlink without bridge row', () => {
    expect(
      preservesHistoricalCoachingAfterUnlink({
        bridgeDeleted: true,
        linkedUserIdCleared: true,
        businessClientRemains: true,
        assignmentsRemain: true,
      }),
    ).toBe(true)
  })
})
