import { describe, expect, it, vi } from 'vitest'
import { FOLLOWUP_REASON_TYPE } from './coachFollowUp'
import {
  APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF,
  buildAppointmentScheduleConflictProposal,
  findOpenScheduleConflictFollowUp,
  formatAppointmentScheduleConflictLine,
  hasOpenScheduleConflictFollowUp,
  submitAppointmentScheduleConflict,
} from './appointmentScheduleConflict'
import { RSVP_STATUS } from './sessionRsvp'
import {
  ATTENTION_REASON_TYPES,
  buildCoachAttentionQueue,
  formatAttentionExplanation,
} from '../ava/coach/avaCoachAttention'

const appointment = {
  id: 'appt-1',
  coachId: 'coach-correct',
  coach_id: 'coach-correct',
  athleteId: 'athlete-1',
  coachDisplayName: 'Jacob Corell',
  sessionDate: '2026-08-12',
  startTime: '09:00:00',
  scheduleTimezone: 'America/New_York',
  status: 'scheduled',
  rsvpStatus: RSVP_STATUS.AWAITING,
  appointmentType: 'IN_PERSON_TRAINING',
  assignmentId: 'assign-1',
}

describe('appointmentScheduleConflict', () => {
  it('builds a schedule-conflict proposal from the current appointment', () => {
    const proposal = buildAppointmentScheduleConflictProposal(appointment)

    expect(proposal.reasonType).toBe(FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT)
    expect(proposal.scheduledSessionId).toBe('appt-1')
    expect(proposal.coachId).toBe('coach-correct')
    expect(proposal.assignmentId).toBe('assign-1')
    expect(proposal.summary).toContain('Schedule conflict')
    expect(proposal.summary.length).toBeGreaterThan(8)
  })

  it('formats the handoff line from appointment context', () => {
    expect(formatAppointmentScheduleConflictLine(appointment)).toBe(
      'In-person training with Jacob Corell',
    )
  })

  it('detects an open schedule-conflict follow-up for the same appointment', () => {
    const followUps = [
      {
        id: 'f1',
        athleteId: 'athlete-1',
        reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
        scheduledSessionId: 'appt-1',
        status: 'open',
      },
      {
        id: 'f2',
        athleteId: 'athlete-1',
        reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
        scheduledSessionId: 'appt-2',
        status: 'resolved',
      },
    ]

    expect(hasOpenScheduleConflictFollowUp(followUps, 'appt-1')).toBe(true)
    expect(findOpenScheduleConflictFollowUp(followUps, 'appt-2')).toBeNull()
  })

  it('rejects mismatched coach_id + scheduled_session_id combinations at resolution time', async () => {
    const createFollowUp = vi.fn().mockImplementation(async (proposal) => {
      expect(proposal.coachId).toBe('coach-correct')
      expect(proposal.scheduledSessionId).toBe('appt-1')
      return { id: 'f-new' }
    })

    await submitAppointmentScheduleConflict({
      appointment,
      existingFollowUps: [],
      createFollowUp,
      updateRsvp: vi.fn().mockResolvedValue({
        ok: true,
        session: { ...appointment, rsvpStatus: RSVP_STATUS.CANNOT_ATTEND },
      }),
    })
  })

  it('creates follow-up and updates RSVP on submit', async () => {
    const createFollowUp = vi.fn().mockResolvedValue({ id: 'f-new' })
    const updateRsvp = vi.fn().mockResolvedValue({
      ok: true,
      session: { ...appointment, rsvpStatus: RSVP_STATUS.CANNOT_ATTEND },
    })

    const result = await submitAppointmentScheduleConflict({
      appointment,
      existingFollowUps: [],
      createFollowUp,
      updateRsvp,
    })

    expect(createFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledSessionId: 'appt-1',
        reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
      }),
    )
    expect(updateRsvp).toHaveBeenCalledWith('appt-1', RSVP_STATUS.CANNOT_ATTEND)
    expect(result.ok).toBe(true)
    expect(result.alreadySent).toBe(false)
  })

  it('prevents duplicate open schedule-conflict follow-ups', async () => {
    const existing = {
      id: 'f-existing',
      athleteId: 'athlete-1',
      reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
      scheduledSessionId: 'appt-1',
      status: 'open',
    }
    const createFollowUp = vi.fn()
    const updateRsvp = vi.fn().mockResolvedValue({
      ok: true,
      session: { ...appointment, rsvpStatus: RSVP_STATUS.CANNOT_ATTEND },
    })

    const result = await submitAppointmentScheduleConflict({
      appointment,
      existingFollowUps: [existing],
      createFollowUp,
      updateRsvp,
    })

    expect(createFollowUp).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(result.alreadySent).toBe(true)
    expect(result.followUp.id).toBe('f-existing')
  })

  it('returns an error when follow-up creation is unavailable', async () => {
    const result = await submitAppointmentScheduleConflict({
      appointment,
      existingFollowUps: [],
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('follow_up_unavailable')
  })

  it('fails before insert when appointment coachId is missing', async () => {
    const createFollowUp = vi.fn()
    const liveRpcAppointment = {
      id: 'appt-1',
      coachDisplayName: 'Jacob Corell',
      sessionDate: '2026-08-12',
      startTime: '09:00:00',
      scheduleTimezone: 'America/New_York',
      status: 'scheduled',
      rsvpStatus: RSVP_STATUS.AWAITING,
      appointmentType: 'IN_PERSON_TRAINING',
    }

    const result = await submitAppointmentScheduleConflict({
      appointment: liveRpcAppointment,
      existingFollowUps: [],
      createFollowUp,
      updateRsvp: vi.fn(),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('followup_missing_session_coach')
    expect(createFollowUp).not.toHaveBeenCalled()
  })

  it('creates follow-up from live RPC shape when coach_id is present', async () => {
    const createFollowUp = vi.fn().mockResolvedValue({ id: 'f-new' })
    const updateRsvp = vi.fn().mockResolvedValue({
      ok: true,
      session: {
        id: 'appt-1',
        coach_id: 'coach-correct',
        rsvp_status: RSVP_STATUS.CANNOT_ATTEND,
      },
    })

    const result = await submitAppointmentScheduleConflict({
      appointment: {
        id: 'appt-1',
        coach_id: 'coach-correct',
        coachDisplayName: 'Jacob Corell',
        sessionDate: '2026-08-12',
        startTime: '09:00:00',
        scheduleTimezone: 'America/New_York',
        status: 'scheduled',
        rsvpStatus: RSVP_STATUS.AWAITING,
        appointmentType: 'IN_PERSON_TRAINING',
      },
      existingFollowUps: [],
      createFollowUp,
      updateRsvp,
    })

    expect(createFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        coachId: 'coach-correct',
        scheduledSessionId: 'appt-1',
        sessionId: null,
        reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
      }),
    )
    expect(createFollowUp.mock.calls[0][0].scheduledSessionId).toBe('appt-1')
    expect(createFollowUp.mock.calls[0][0].sessionId).toBeNull()
    expect(result.ok).toBe(true)
  })

  it('returns an error when RSVP update fails after follow-up creation', async () => {
    const createFollowUp = vi.fn().mockResolvedValue({ id: 'f-new' })
    const updateRsvp = vi.fn().mockResolvedValue({ ok: false, error: 'rsvp_failed' })

    const result = await submitAppointmentScheduleConflict({
      appointment,
      existingFollowUps: [],
      createFollowUp,
      updateRsvp,
    })

    expect(result.ok).toBe(false)
    expect(result.partial).toBe(true)
    expect(result.error).toBe('rsvp_failed')
  })
})

describe('appointment schedule conflict coach attention', () => {
  it('surfaces appointment-linked schedule conflicts for coach attention', () => {
    const coachContext = {
      portfolioStatus: 'ready',
      portfolio: {
        rosterEntries: [
          {
            client: { athlete_id: 'athlete-1', display_name: 'Jacob Corell' },
            clientName: 'Jacob Corell',
            intelligence: { attention: [], readiness: { available: false } },
          },
        ],
      },
      athleteStatesById: { 'athlete-1': { history: [] } },
      weeklyReviewsByAthleteId: {},
      weeklyCheckInsByAthleteId: {},
      coachFollowUpsByAthleteId: {
        'athlete-1': [
          {
            id: 'f1',
            athleteId: 'athlete-1',
            reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
            scheduledSessionId: 'appt-1',
            summary: 'Schedule conflict: Wed · 9:00 AM in-person session.',
            status: 'open',
          },
        ],
      },
    }

    const { queue } = buildCoachAttentionQueue(coachContext)
    expect(queue.length).toBe(1)
    expect(queue[0].reasons[0].type).toBe(
      ATTENTION_REASON_TYPES.COACH_FOLLOWUP_NEEDED,
    )
    expect(formatAttentionExplanation(queue[0])).toContain('Schedule conflict')
  })
})

describe('appointment schedule conflict copy', () => {
  it('uses athlete-facing handoff strings', () => {
    expect(APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.SEND_LABEL).toBe('Send to coach')
    expect(APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.SUCCESS_TITLE).toBe('Coach notified')
  })
})
