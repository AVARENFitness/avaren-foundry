import { describe, expect, it, vi } from 'vitest'
import { createAvaSession } from '../../lib/avaConversation'
import { buildAvaContextPacket } from '../../lib/avaContext'
import { runCoachFollowUpPipelineStep } from './avaCoachFollowUpPipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import { buildCoachAttentionQueue, ATTENTION_REASON_TYPES, formatAttentionExplanation } from './avaCoachAttention'
import { FOLLOWUP_REASON_TYPE } from '../../lib/coachFollowUp'
import { explainClientAttention, queryClientFollowUps } from './avaCoachQueries'
import { matchCoachOperationalQuery } from './avaCoachQueryPatterns'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { SESSION_MODE } from '../../lib/sessionMode'

const coachedPacket = (overrides = {}) => {
  const state = {
    program: {
      nextWorkout: 'Chest + Back',
      workouts: {
        'Chest + Back': [
          { name: 'Bench Press', muscle: 'Chest', sets: 4 },
        ],
      },
    },
    weeklySchedule: { 0: 'Rest', 1: 'Chest + Back' },
    history: [],
    activeWorkout: {
      id: 'session-1',
      name: 'Chest + Back',
      sessionMode: SESSION_MODE.IN_PERSON_COACHED,
      exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: [{ number: 1 }] }],
    },
  }

  const packet = buildAvaContextPacket(state, {
    now: new Date('2026-08-09T15:00:00.000Z'),
    assignments: [
      {
        id: 'assign-1',
        status: 'assigned',
        title: 'Chest + Back',
        due_date: '2026-08-09',
        workout_payload: {
          name: 'Chest + Back',
          exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 4 }],
        },
      },
    ],
  })

  return { ...packet, ...overrides }
}

describe('avaCoachFollowUpPipeline', () => {
  it('answers in-person coach session context deterministically', async () => {
    const outcome = await runCoachFollowUpPipelineStep({
      message: 'Is this with my coach?',
      session: createAvaSession(),
      packet: coachedPacket(),
      role: 'athlete',
    })

    expect(outcome?.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome?.message).toMatch(/In-Person Session/i)
  })

  it('offers flag-for-coach on pain without modifying program', async () => {
    const outcome = await runCoachFollowUpPipelineStep({
      message: 'My shoulder hurts on bench.',
      session: createAvaSession(),
      packet: coachedPacket(),
      role: 'athlete',
    })

    expect(outcome?.kind).toBe(AVA_PIPELINE_KIND.FOLLOW_UP_PROPOSAL)
    expect(outcome?.message.toLowerCase()).toMatch(/stop|don't force/)
    expect(outcome?.followUpProposal?.reasonType).toBe(
      FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT,
    )
    expect(outcome?.followUpProposal?.summary.toLowerCase()).toContain('bench')
    expect(outcome?.followUpProposal?.summary.toLowerCase()).toContain('shoulder')
    expect(outcome?.followUpProposal?.summary.toLowerCase()).not.toContain('hurts on bench')
    expect(outcome?.followUpProposal?.athleteMessage).toBeUndefined()
  })

  it('offers schedule-conflict follow-up without storing raw transcript', async () => {
    const outcome = await runCoachFollowUpPipelineStep({
      message: "I can't make Friday because of a family thing.",
      session: createAvaSession(),
      packet: coachedPacket(),
      role: 'athlete',
    })

    expect(outcome?.kind).toBe(AVA_PIPELINE_KIND.FOLLOW_UP_PROPOSAL)
    expect(outcome?.followUpProposal?.reasonType).toBe(
      FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
    )
    expect(outcome?.followUpProposal?.summary).toBe('Unable to make Friday session.')
  })

  it('avoids diagnosis language on pain requests', async () => {
    const outcome = await runCoachFollowUpPipelineStep({
      message: 'My shoulder hurts on bench.',
      session: createAvaSession(),
      packet: coachedPacket(),
      role: 'athlete',
    })

    expect(outcome?.message.toLowerCase()).not.toMatch(/torn|sprain|diagnos/)
    expect(outcome?.message.toLowerCase()).toMatch(/stop|don't force/)
  })

  it('blocks permanent program mutation for coach-assigned sessions', async () => {
    const outcome = await runCoachFollowUpPipelineStep({
      message: 'Take squats out.',
      session: createAvaSession(),
      packet: coachedPacket(),
      role: 'athlete',
    })

    expect(outcome?.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome?.message).toMatch(/coach can adjust that during the session/i)
    expect(outcome?.readOnly).toBe(true)
  })

  it('submits follow-up through runtime on confirmation', async () => {
    const submitCoachFollowUp = vi.fn().mockResolvedValue({ id: 'f1' })
    const session = createAvaSession()

    await runCoachFollowUpPipelineStep({
      message: 'My shoulder hurts on bench.',
      session,
      packet: coachedPacket(),
      role: 'athlete',
    })

    const outcome = await runCoachFollowUpPipelineStep({
      message: 'send to coach',
      session,
      packet: coachedPacket(),
      actionRuntime: { submitCoachFollowUp },
      role: 'athlete',
    })

    expect(submitCoachFollowUp).toHaveBeenCalled()
    expect(outcome?.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
  })
})

describe('coach attention follow-up integration', () => {
  it('surfaces structured athlete follow-ups in attention queue', () => {
    const coachContext = {
      portfolioStatus: 'ready',
      portfolio: {
        rosterEntries: [
          {
            client: { athlete_id: 'athlete-1', display_name: 'Jake' },
            clientName: 'Jake',
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
            reasonType: FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT,
            summary: 'Shoulder discomfort during Bench Press.',
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
    expect(queue[0].reasons[0].evidence).toContain('Shoulder discomfort')
  })

  it('explains structured follow-ups for a named client', () => {
    const coachContext = {
      portfolioStatus: 'ready',
      portfolio: {
        rosterEntries: [
          {
            client: { athlete_id: 'athlete-1', display_name: 'Jake' },
            clientName: 'Jake',
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
            summary: 'Unable to make Friday session.',
            status: 'open',
          },
        ],
      },
    }

    const message = explainClientAttention('athlete-1', coachContext)
    expect(message).toContain('Jake')
    expect(message).toContain('Unable to make Friday session.')
  })

  it('routes any client follow-ups query deterministically', () => {
    const match = matchCoachOperationalQuery('Any client follow-ups?')
    expect(match?.actionId).toBe(AVA_ACTION_IDS.SHOW_CLIENT_FOLLOWUPS)
  })

  it('returns open follow-ups from coach query', () => {
    const coachContext = {
      portfolioStatus: 'ready',
      portfolio: {
        rosterEntries: [
          {
            client: { athlete_id: 'athlete-1', display_name: 'Jake' },
            clientName: 'Jake',
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
            reasonType: FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT,
            summary: 'Shoulder discomfort during Bench Press.',
            status: 'open',
          },
        ],
      },
    }

    const result = queryClientFollowUps(coachContext)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].clientName).toBe('Jake')
  })

  it('formats follow-up attention explanations from evidence', () => {
    const message = formatAttentionExplanation({
      displayName: 'Jake',
      reasons: [
        {
          type: ATTENTION_REASON_TYPES.COACH_FOLLOWUP_NEEDED,
          evidence: 'Shoulder discomfort during Bench Press.',
        },
      ],
    })

    expect(message).toContain('Shoulder discomfort during Bench Press.')
  })
})
