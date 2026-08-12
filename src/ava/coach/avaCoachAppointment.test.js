import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createAvaSession } from '../../lib/avaConversation'
import { buildAvaContextPacket } from '../../lib/avaContext'
import { runAthleteAppointmentPipelineStep, isAthleteAppointmentQuery } from './avaAthleteAppointmentPipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import { matchCoachOperationalQuery } from './avaCoachQueryPatterns'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { formatAthleteAppointmentMessage } from './avaCoachAppointmentQueries'
import { runCoachFollowUpPipelineStep } from './avaCoachFollowUpPipeline'
import { FOLLOWUP_REASON_TYPE } from '../../lib/coachFollowUp'
import { coachBackend } from '../../lib/coachBackend'
import { resolveSessionMode, SESSION_MODE } from '../../lib/sessionMode'
import { hasScheduledInPersonToday } from '../../lib/sessionMode'

vi.mock('../../lib/coachBackend', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    coachBackend: {
      ...actual.coachBackend,
      listAthleteScheduledSessions: vi.fn(),
    },
  }
})

describe('coaching appointment AVA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects athlete appointment queries', () => {
    expect(isAthleteAppointmentQuery('When do I train with my coach?')).toBe(true)
    expect(isAthleteAppointmentQuery('Log chicken rice')).toBe(false)
  })

  it('routes coach today appointment query deterministically', () => {
    const match = matchCoachOperationalQuery('Who am I training today?')
    expect(match?.actionId).toBe(AVA_ACTION_IDS.SHOW_TODAY_APPOINTMENTS)
  })

  it('answers athlete appointment queries from canonical data', async () => {
    coachBackend.listAthleteScheduledSessions.mockResolvedValue([
      {
        id: 'appt-1',
        coach_display_name: 'Coach',
        session_date: '2026-08-11',
        start_time: '15:00',
        starts_at: '2026-08-11T19:00:00.000Z',
        duration_minutes: 60,
        status: 'scheduled',
        linked_workout_title: 'Chest & Back',
      },
    ])

    const outcome = await runAthleteAppointmentPipelineStep({
      message: 'When do I train with my coach?',
      session: createAvaSession(),
      packet: {},
      now: new Date('2026-08-09T15:00:00.000Z'),
    })

    expect(outcome?.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome?.message).toContain('Chest & Back')
    expect(outcome?.message.toLowerCase()).toContain('in-person')
  })

  it('returns a clean empty-state answer when no appointments exist', async () => {
    coachBackend.listAthleteScheduledSessions.mockResolvedValue([])

    const outcome = await runAthleteAppointmentPipelineStep({
      message: 'When do I train with my coach?',
      session: createAvaSession(),
      packet: {
        athleteAppointments: [],
        athleteAppointmentsReady: true,
      },
    })

    expect(outcome?.message).toBe(
      "You don't have an in-person session scheduled right now.",
    )
    expect(coachBackend.listAthleteScheduledSessions).not.toHaveBeenCalled()
  })

  it('does not treat loading canonical state as an empty appointment list', async () => {
    coachBackend.listAthleteScheduledSessions.mockResolvedValue([
      {
        id: 'appt-live',
        coach_display_name: 'Coach',
        session_date: '2026-08-12',
        start_time: '15:00',
        starts_at: '2026-08-12T19:00:00.000Z',
        duration_minutes: 60,
        status: 'scheduled',
      },
    ])

    const outcome = await runAthleteAppointmentPipelineStep({
      message: 'When do I train with my coach?',
      session: createAvaSession(),
      packet: {
        athleteAppointments: [],
        athleteAppointmentsReady: false,
      },
      now: new Date('2026-08-09T15:00:00.000Z'),
    })

    expect(coachBackend.listAthleteScheduledSessions).toHaveBeenCalledTimes(1)
    expect(outcome?.message.toLowerCase()).toContain('coach')
  })

  it('uses canonical provider state when ready', async () => {
    const outcome = await runAthleteAppointmentPipelineStep({
      message: 'When do I train with my coach?',
      session: createAvaSession(),
      packet: {
        athleteAppointments: [
          {
            id: 'appt-cached',
            coachDisplayName: 'Coach',
            sessionDate: '2026-08-12',
            startTime: '15:00',
            startsAt: '2026-08-12T19:00:00.000Z',
            durationMinutes: 60,
            status: 'scheduled',
          },
        ],
        athleteAppointmentsReady: true,
      },
      now: new Date('2026-08-09T15:00:00.000Z'),
    })

    expect(coachBackend.listAthleteScheduledSessions).not.toHaveBeenCalled()
    expect(outcome?.message.toLowerCase()).toContain('coach')
  })

  it('does not answer empty before provider hydration when loading', async () => {
    coachBackend.listAthleteScheduledSessions.mockResolvedValue([
      {
        id: 'appt-live',
        coach_display_name: 'Coach',
        session_date: '2026-08-12',
        start_time: '15:00',
        starts_at: '2026-08-12T19:00:00.000Z',
        duration_minutes: 60,
        status: 'scheduled',
      },
    ])

    const outcome = await runAthleteAppointmentPipelineStep({
      message: 'When do I train with my coach?',
      session: createAvaSession(),
      packet: {
        athleteAppointments: [],
        athleteAppointmentsReady: false,
        athleteAppointmentsLoading: true,
      },
      now: new Date('2026-08-09T15:00:00.000Z'),
    })

    expect(coachBackend.listAthleteScheduledSessions).toHaveBeenCalledTimes(1)
    expect(outcome?.message.toLowerCase()).not.toContain(
      "don't have an in-person session scheduled",
    )
    expect(outcome?.message.toLowerCase()).toContain('coach')
  })

  it('answers empty only when provider state is ready and empty', async () => {
    const outcome = await runAthleteAppointmentPipelineStep({
      message: 'When do I train with my coach?',
      session: createAvaSession(),
      packet: {
        athleteAppointments: [],
        athleteAppointmentsReady: true,
      },
    })

    expect(coachBackend.listAthleteScheduledSessions).not.toHaveBeenCalled()
    expect(outcome?.message).toBe(
      "You don't have an in-person session scheduled right now.",
    )
  })

  it('classifies RPC failures instead of throwing', async () => {
    coachBackend.listAthleteScheduledSessions.mockRejectedValue(
      new Error('Appointment scheduling is not installed.'),
    )

    const outcome = await runAthleteAppointmentPipelineStep({
      message: 'When do I train with my coach?',
      session: createAvaSession(),
      packet: {},
    })

    expect(outcome?.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome?.message.toLowerCase()).toContain('appointment')
  })

  it('formats athlete appointment message without assignments', () => {
    const copy = formatAthleteAppointmentMessage(
      [
        {
          id: 'appt-1',
          sessionDate: '2026-08-11',
          startTime: '15:00',
          startsAt: '2026-08-11T19:00:00.000Z',
          status: 'scheduled',
        },
      ],
      new Date('2026-08-09T15:00:00.000Z'),
    )

    expect(copy.toLowerCase()).toContain('coach')
  })

  it('returns empty-state copy when no appointments exist', () => {
    expect(formatAthleteAppointmentMessage([], new Date())).toBe(
      "You don't have an in-person session scheduled right now.",
    )
  })
})

describe('appointment vs workout separation', () => {
  it('does not label solo assignment days as in-person without appointment', () => {
    const thursday = '2026-08-13'
    const appointments = [
      {
        sessionDate: '2026-08-11',
        status: 'scheduled',
      },
    ]

    expect(hasScheduledInPersonToday(appointments, thursday)).toBe(false)
    expect(
      resolveSessionMode({
        assignmentId: 'assign-legs',
        coachAssigned: true,
        linkedAppointmentToday: false,
      }),
    ).toBe(SESSION_MODE.COACH_ASSIGNED)
  })

  it('builds train context only for linked assignment appointments', async () => {
    const { buildAthleteAppointmentContextLine } = await import('./avaAthleteAppointmentPipeline')
    const appointments = [
      {
        id: 'appt-1',
        sessionDate: '2026-08-11',
        startTime: '15:00',
        startsAt: '2026-08-11T19:00:00.000Z',
        status: 'scheduled',
        assignmentId: 'assign-chest',
        linkedWorkoutTitle: 'Chest & Back',
      },
    ]

    expect(
      buildAthleteAppointmentContextLine(appointments, {
        assignmentId: 'assign-chest',
        now: new Date('2026-08-11T12:00:00.000Z'),
      }),
    ).toContain('In person today')

    expect(
      buildAthleteAppointmentContextLine(appointments, {
        assignmentId: 'assign-legs',
        now: new Date('2026-08-11T12:00:00.000Z'),
      }),
    ).toBeNull()
  })
})

describe('schedule conflict appointment handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links schedule conflict follow-up to matched appointment', async () => {
    coachBackend.listAthleteScheduledSessions.mockResolvedValue([
      {
        id: 'appt-tue',
        session_date: '2026-08-11',
        start_time: '15:00',
        starts_at: '2026-08-11T19:00:00.000Z',
        status: 'scheduled',
        linked_workout_title: 'Chest & Back',
      },
    ])

    const packet = buildAvaContextPacket(
      {
        program: { nextWorkout: 'Chest + Back', workouts: {} },
        weeklySchedule: {},
        history: [],
      },
      {
        assignments: [{ id: 'assign-1', status: 'assigned', title: 'Chest + Back' }],
      },
    )

    const outcome = await runCoachFollowUpPipelineStep({
      message: "I can't make Tuesday at 3",
      session: createAvaSession(),
      packet: { ...packet, hasCoachRelationship: true },
      role: 'athlete',
      now: new Date('2026-08-09T15:00:00.000Z'),
    })

    expect(outcome?.kind).toBe(AVA_PIPELINE_KIND.FOLLOW_UP_PROPOSAL)
    expect(outcome?.followUpProposal?.reasonType).toBe(
      FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
    )
    expect(outcome?.followUpProposal?.scheduledSessionId).toBe('appt-tue')
    expect(outcome?.followUpProposal?.summary).toContain('Tue')
  })
})
