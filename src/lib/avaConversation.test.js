import { describe, expect, it } from 'vitest'
import { AVA_DAILY_STATES } from './avaIntelligence'
import { buildAvaContextPacket } from './avaContext'
import {
  AVA_SESSION_MAX_TURNS,
  buildAvaOpeningMessage,
  buildAvaSuggestedPrompts,
  conversationCannotMutateCanonicalWorkout,
  createAvaSession,
  respondToAvaMessage,
} from './avaConversation'

const today = new Date().toISOString().slice(0, 10)

const readyState = {
  history: [
    {
      id: 'session-1',
      date: today,
      name: 'Chest + Back',
      sets: [
        {
          exercise: 'Bench Press',
          muscle: 'Chest',
          weight: 185,
          reps: 5,
          estimatedOneRepMax: 215,
        },
      ],
    },
  ],
  readiness: {
    entries: [
      {
        id: 'ready-1',
        date: today,
        sleep: 4,
        energy: 4,
        soreness: 2,
        stress: 2,
      },
    ],
  },
  selectedWorkout: 'Chest + Back',
  program: {
    nextWorkout: 'Chest + Back',
    workouts: {
      'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
    },
  },
  weeklySchedule: ['Rest', 'Chest + Back', 'Arms', 'Legs', 'Chest + Back', 'Arms', 'Rest'],
  mobility: {
    completed: [
      { flowId: 'daily-reset', completedAt: `${today}T07:00:00` },
      { flowId: 'recovery-flow', completedAt: `${today}T07:30:00` },
    ],
  },
  nutrition: {
    goals: { calories: 2200, protein: 170 },
    days: {
      [today]: {
        date: today,
        foods: [{ name: 'Chicken', calories: 400, protein: 45 }],
      },
    },
  },
}

const buildPacket = (state = readyState, options = {}) =>
  buildAvaContextPacket(state, {
    userName: 'Jacob',
    now: new Date(`${today}T18:00:00`),
    ...options,
  })

describe('avaConversation', () => {
  it('opens with contextual workout-aware language', () => {
    const packet = buildPacket()
    expect(buildAvaOpeningMessage(packet)).toContain('Chest & Back')
  })

  it('suggests contextual prompts for workout days', () => {
    const prompts = buildAvaSuggestedPrompts(buildPacket())
    expect(prompts.some((item) => /train as planned/i.test(item))).toBe(true)
    expect(prompts.some((item) => /Chest & Back/i.test(item))).toBe(true)
  })

  it('resolves "Should I still do it?" to the canonical workout', () => {
    const packet = buildPacket()
    const session = createAvaSession()
    const response = respondToAvaMessage({
      message: 'Should I still do it?',
      packet,
      session,
    })

    expect(response.summary).toContain('Chest & Back')
    expect(response.summary.toLowerCase()).not.toContain('arms')
  })

  it('retains follow-up topic within a bounded session', () => {
    const packet = buildPacket()
    const session = createAvaSession()

    respondToAvaMessage({
      message: "I'm tired.",
      packet,
      session,
    })
    const followUp = respondToAvaMessage({
      message: 'What should I change?',
      packet,
      session,
    })

    expect(followUp.summary.length).toBeGreaterThan(10)

    for (let index = 0; index < AVA_SESSION_MAX_TURNS + 2; index += 1) {
      session.add('user', `message ${index}`)
      session.add('ava', `reply ${index}`)
    }

    expect(session.messages.length).toBeLessThanOrEqual(AVA_SESSION_MAX_TURNS * 2)
  })

  it('cannot change canonical workout truth in conversation output', () => {
    const packet = buildPacket()
    const response = respondToAvaMessage({
      message: 'Switch me to Arms instead.',
      packet,
      session: createAvaSession(),
    })

    expect(conversationCannotMutateCanonicalWorkout(response, packet)).toBe(true)
    expect(packet.facts.canonicalWorkout).toBe('Chest + Back')
  })

  it('acknowledges coach-assigned workouts naturally', () => {
    const assignment = {
      id: 'assign-1',
      status: 'assigned',
      title: 'Chest and Back',
      due_date: today,
      workout_payload: {
        name: 'Chest and Back',
        exercises: [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
      },
    }

    const packet = buildPacket(readyState, { assignments: [assignment] })
    const response = respondToAvaMessage({
      message: 'Did my coach assign this?',
      packet,
      session: createAvaSession(),
    })

    expect(response.summary.toLowerCase()).toContain('coach')
    expect(response.summary).toContain('Chest and Back')
  })

  it('uses readiness context for recovery questions', () => {
    const lowReadinessState = {
      ...readyState,
      readiness: {
        entries: [
          {
            id: 'ready-1',
            date: today,
            sleep: 2,
            energy: 2,
            soreness: 5,
            stress: 4,
          },
        ],
      },
    }

    const packet = buildAvaContextPacket(lowReadinessState, {
      userName: 'Jacob',
      now: new Date(`${today}T18:00:00`),
    })

    const response = respondToAvaMessage({
      message: 'Should I take it easy today?',
      packet,
      session: createAvaSession(),
    })

    expect(response.summary.toLowerCase()).toMatch(/recovery|controlled|hard/)
  })

  it('does not fabricate nutrition when nothing is logged', () => {
    const packet = buildAvaContextPacket(
      {
        ...readyState,
        nutrition: { goals: { calories: 2200, protein: 170 }, days: {} },
      },
      { userName: 'Jacob', now: new Date(`${today}T18:00:00`) },
    )

    const response = respondToAvaMessage({
      message: 'How am I doing on protein today?',
      packet,
      session: createAvaSession(),
    })

    expect(response.summary.toLowerCase()).toContain('enough logged')
    expect(response.summary).not.toMatch(/45g/)
  })

  it('avoids invalid performance claims when no validated win exists', () => {
    const packet = buildAvaContextPacket(
      {
        ...readyState,
        history: [
          {
            id: 'mobility-only',
            date: today,
            name: 'Recovery',
            sets: [{ exercise: 'Toe Touches', muscle: 'Mobility', reps: 10 }],
          },
        ],
      },
      { userName: 'Jacob', now: new Date(`${today}T18:00:00`) },
    )

    expect(packet.performance).toBeNull()

    const response = respondToAvaMessage({
      message: 'Am I getting stronger?',
      packet,
      session: createAvaSession(),
    })

    expect(response.summary.toLowerCase()).not.toContain('session volume')
    expect(response.summary.toLowerCase()).not.toContain('toe touches')
  })

  it('offers low-data prompts and guidance', () => {
    const packet = buildAvaContextPacket(
      {
        history: [],
        readiness: { entries: [] },
        program: readyState.program,
      },
      { userName: 'Jacob', now: new Date(`${today}T09:00:00`) },
    )

    const prompts = buildAvaSuggestedPrompts(packet)
    expect(prompts[0].toLowerCase()).toContain('first')
    expect(buildAvaOpeningMessage(packet).toLowerCase()).toContain('baseline')
  })

  it('degrades gracefully when conversation processing fails', () => {
    const packet = buildPacket()
    const brokenSession = {
      add: () => {
        throw new Error('session-failed')
      },
      getRecentUserMessages: () => [],
    }

    const response = respondToAvaMessage({
      message: 'Why?',
      packet,
      session: brokenSession,
    })

    expect(response.ok).toBe(false)
    expect(response.summary.toLowerCase()).toContain("today's recommendation")
  })

  it('can disagree when another hard session is a poor fit', () => {
    const lowReadinessState = {
      ...readyState,
      readiness: {
        entries: [
          {
            id: 'ready-1',
            date: today,
            sleep: 2,
            energy: 2,
            soreness: 5,
            stress: 4,
          },
        ],
      },
    }

    const packet = buildAvaContextPacket(lowReadinessState, {
      userName: 'Jacob',
      now: new Date(`${today}T12:00:00`),
    })

    expect(packet.briefing.dailyState).toBe(AVA_DAILY_STATES.RECOVERY_PRIORITY)

    const response = respondToAvaMessage({
      message: 'I want to do another hard workout tonight.',
      packet,
      session: createAvaSession(),
    })

    expect(response.summary.toLowerCase()).toContain('wouldn')
    expect(response.data.disagreement).toBe(true)
  })
})
