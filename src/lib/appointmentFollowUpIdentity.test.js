import { describe, expect, it, vi } from 'vitest'
import {
  buildAppointmentCoachIdentityDiagnostics,
  buildFollowUpInsertDiagnostics,
  buildScheduleConflictFollowUpForensics,
  inferFollowUpScheduledSessionFailure,
  resolveAppointmentCoachId,
  resolveAppointmentLinkedFollowUpCoachId,
  resolveFollowUpCoachId,
} from './appointmentFollowUpIdentity'

describe('buildAppointmentCoachIdentityDiagnostics', () => {
  it('reports safe booleans for live appointment identity fields', () => {
    expect(
      buildAppointmentCoachIdentityDiagnostics({
        id: 'appt-1',
        coach_id: 'coach-1',
        coachDisplayName: 'Jacob Corell',
      }),
    ).toEqual({
      appointmentIdPresent: true,
      coachIdPresent: false,
      coach_idPresent: true,
      coachDisplayNamePresent: true,
      athleteIdPresent: false,
    })

    expect(
      buildAppointmentCoachIdentityDiagnostics({
        id: 'appt-1',
        coachId: 'coach-1',
        coachDisplayName: 'Jacob Corell',
        athleteId: 'athlete-1',
      }),
    ).toEqual({
      appointmentIdPresent: true,
      coachIdPresent: true,
      coach_idPresent: false,
      coachDisplayNamePresent: true,
      athleteIdPresent: true,
    })
  })
})

describe('resolveAppointmentCoachId', () => {
  it('prefers normalized coachId over coach_id', () => {
    expect(
      resolveAppointmentCoachId({
        coachId: 'coach-normalized',
        coach_id: 'coach-raw',
      }),
    ).toBe('coach-normalized')
  })

  it('maps live RPC coach_id to canonical coachId', () => {
    expect(
      resolveAppointmentCoachId({
        coach_id: 'coach-from-rpc',
      }),
    ).toBe('coach-from-rpc')
  })
})

describe('resolveAppointmentLinkedFollowUpCoachId', () => {
  it('uses appointment coachId without fallback lookup', () => {
    expect(
      resolveAppointmentLinkedFollowUpCoachId({
        coachId: 'coach-correct',
        scheduledSessionId: 'appt-1',
      }),
    ).toBe('coach-correct')
  })

  it('fails loudly when appointment coachId is missing', () => {
    expect(() =>
      resolveAppointmentLinkedFollowUpCoachId({
        scheduledSessionId: 'appt-1',
      }),
    ).toThrow('followup_missing_session_coach')
  })
})

describe('resolveFollowUpCoachId', () => {
  it('prefers canonical appointment coach_id over default coach lookup', async () => {
    const fetchDefaultCoachId = vi.fn().mockResolvedValue('coach-wrong')

    const resolved = await resolveFollowUpCoachId({
      coachId: 'coach-correct',
      scheduledSessionId: 'appt-1',
      fetchDefaultCoachId,
    })

    expect(resolved).toBe('coach-correct')
    expect(fetchDefaultCoachId).not.toHaveBeenCalled()
  })

  it('does not resolve coach from assignment for appointment-linked follow-ups', async () => {
    const fetchCoachIdFromAssignment = vi
      .fn()
      .mockResolvedValue('coach-from-assignment')
    const fetchDefaultCoachId = vi.fn().mockResolvedValue('coach-wrong')

    await expect(
      resolveFollowUpCoachId({
        assignmentId: 'assign-1',
        scheduledSessionId: 'appt-1',
        fetchCoachIdFromAssignment,
        fetchDefaultCoachId,
      }),
    ).rejects.toThrow('followup_missing_session_coach')

    expect(fetchCoachIdFromAssignment).not.toHaveBeenCalled()
    expect(fetchDefaultCoachId).not.toHaveBeenCalled()
  })

  it('requires explicit coach identity for scheduled-session follow-ups', async () => {
    await expect(
      resolveFollowUpCoachId({
        scheduledSessionId: 'appt-1',
        fetchDefaultCoachId: vi.fn().mockResolvedValue('coach-wrong'),
      }),
    ).rejects.toThrow('followup_missing_session_coach')
  })

  it('falls back to default coach lookup for non-appointment follow-ups', async () => {
    const fetchDefaultCoachId = vi.fn().mockResolvedValue('coach-default')

    const resolved = await resolveFollowUpCoachId({
      fetchDefaultCoachId,
    })

    expect(resolved).toBe('coach-default')
  })
})

describe('buildFollowUpInsertDiagnostics', () => {
  it('reports DEV-safe insert identity booleans', () => {
    expect(
      buildFollowUpInsertDiagnostics({
        athleteId: 'athlete-1',
        coachId: 'coach-1',
        scheduledSessionId: 'appt-1',
        assignmentId: 'assign-1',
        reasonType: 'SCHEDULE_CONFLICT',
        sourceType: 'ava_athlete',
      }),
    ).toEqual({
      athleteMatchesAuth: true,
      coachIdPresent: true,
      scheduledSessionIdPresent: true,
      assignmentLinked: true,
      reasonType: 'SCHEDULE_CONFLICT',
      sourceType: 'ava_athlete',
    })
  })
})

describe('buildScheduleConflictFollowUpForensics', () => {
  const appointment = {
    id: 'appt-1',
    coachId: 'coach-correct',
    coachDisplayName: 'Jacob Corell',
  }

  it('reports payload identity alignment for a live-shape appointment', () => {
    expect(
      buildScheduleConflictFollowUpForensics({
        appointment,
        authAthleteId: 'athlete-1',
        followUpPayload: {
          scheduled_session_id: 'appt-1',
          coach_id: 'coach-correct',
          athlete_id: 'athlete-1',
        },
      }),
    ).toEqual({
      sessionExists: null,
      sessionIdMatchesDisplayedAppointment: true,
      coachMatches: true,
      athleteMatches: true,
      authMatchesAthlete: true,
      coachClientRelationshipExists: null,
    })
  })

  it('detects wrong scheduled_session_id before insert', () => {
    expect(
      buildScheduleConflictFollowUpForensics({
        appointment,
        authAthleteId: 'athlete-1',
        followUpPayload: {
          scheduled_session_id: 'wrong-id',
          coach_id: 'coach-correct',
          athlete_id: 'athlete-1',
        },
      }).sessionIdMatchesDisplayedAppointment,
    ).toBe(false)
  })
})

describe('inferFollowUpScheduledSessionFailure', () => {
  it('infers RLS-blind trigger when all payload identities align', () => {
    expect(
      inferFollowUpScheduledSessionFailure({
        errorMessage: 'followup_insert_invalid_scheduled_session',
        forensics: {
          sessionIdMatchesDisplayedAppointment: true,
          coachMatches: true,
          athleteMatches: true,
          authMatchesAthlete: true,
        },
      }),
    ).toBe('trigger_session_lookup_blocked_by_rls')
  })

  it('infers coach mismatch when coach_id differs', () => {
    expect(
      inferFollowUpScheduledSessionFailure({
        errorMessage: 'followup_insert_invalid_scheduled_session',
        forensics: {
          sessionIdMatchesDisplayedAppointment: true,
          coachMatches: false,
          athleteMatches: true,
          authMatchesAthlete: true,
        },
      }),
    ).toBe('coach_id_mismatch')
  })
})
