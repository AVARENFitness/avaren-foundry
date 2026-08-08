import { describe, expect, it, vi } from 'vitest'
import { buildAvaContextPacket } from './avaContext'
import { createAvaSession } from './avaConversation'
import { buildAvaChatRequestBody } from './avaModelContext'
import { requestAvaChat } from './avaChatBackend'
import { shouldRunNutritionTool } from './avaConversationalRouter'
import {
  isCommitmentStatement,
  recordAvaTurn,
  recordUserTurn,
  shouldCaptureSessionContext,
} from './avaSessionContext'

const today = new Date().toISOString().slice(0, 10)

const readyState = {
  history: [
    {
      id: 'session-1',
      date: today,
      name: 'Chest + Back',
      sets: [{ exercise: 'Bench Press', muscle: 'Chest', weight: 185, reps: 5 }],
    },
  ],
  readiness: {
    entries: [
      {
        id: 'ready-1',
        date: today,
        sleep: 3,
        energy: 3,
        soreness: 3,
        stress: 3,
      },
    ],
  },
  selectedWorkout: 'Chest + Back',
  program: {
    nextWorkout: 'Chest + Back',
    workouts: {
      'Chest + Back': [
        { name: 'Bench Press', sets: 3, muscle: 'Chest' },
        { name: 'Barbell Row', sets: 3, muscle: 'Back' },
      ],
    },
  },
  weeklySchedule: ['Rest', 'Chest + Back', 'Arms', 'Legs', 'Chest + Back', 'Arms', 'Rest'],
  mobility: { completed: [] },
  nutrition: {
    goals: { calories: 2200, protein: 170 },
    days: {},
  },
}

const buildPacket = (state = readyState, options = {}) =>
  buildAvaContextPacket(state, {
    userName: 'Jacob',
    now: new Date(`${today}T18:00:00`),
    ...options,
  })

const simulateTurn = ({ session, packet, user, ava }) => {
  recordUserTurn(session, user, { packet })
  const body = buildAvaChatRequestBody({ message: user, packet, session })
  if (ava) {
    recordAvaTurn(session, ava)
  }
  return body
}

describe('avaSessionContext capture', () => {
  it('recognizes subjective state, time, and commitment statements', () => {
    expect(shouldCaptureSessionContext("I'm feeling pretty tired today")).toBe(true)
    expect(shouldCaptureSessionContext('I only have about 30 minutes')).toBe(true)
    expect(isCommitmentStatement("But I don't want to skip my workout today")).toBe(true)
  })

  it('accumulates bounded session facts without duplicating identical turns', () => {
    const session = createAvaSession()
    const packet = buildPacket()

    recordUserTurn(session, "I'm feeling pretty tired today", { packet })
    recordUserTurn(session, "I'm feeling pretty tired today", { packet })

    expect(session.userStatements).toHaveLength(1)
    expect(session.messages.filter((item) => item.role === 'user')).toHaveLength(1)
  })
})

describe('avaSessionContext multi-turn assembly', () => {
  it('preserves tired + 30 minutes + do-not-skip across four turns', () => {
    const session = createAvaSession()
    const packet = buildPacket()

    simulateTurn({
      session,
      packet,
      user: "I'm feeling pretty tired today",
      ava: "Got it — lower energy today. We can still make useful progress if you're up for it.",
    })
    simulateTurn({
      session,
      packet,
      user: 'I only have about 30 minutes',
      ava: "That's enough for the main work on Chest & Back if we trim the extras.",
    })
    simulateTurn({
      session,
      packet,
      user: "But I don't want to skip my workout today",
      ava: "Then I wouldn't skip it — keep it short and focused.",
    })

    recordUserTurn(session, 'What would you do?', { packet })
    const payload = buildAvaChatRequestBody({
      message: 'What would you do?',
      packet,
      session,
    })

    const transcript = payload.sessionContext.recentMessages.map((item) => item.text).join(' ')
    const constraints = payload.sessionContext.temporaryConstraints.join(' ')
    const statements = payload.sessionContext.userStatements.join(' ')

    expect(transcript.toLowerCase()).toMatch(/tired/)
    expect(transcript.toLowerCase()).toMatch(/30 minutes/)
    expect(transcript.toLowerCase()).toMatch(/don't want to skip/)
    expect(constraints.toLowerCase()).toMatch(/30 minutes/)
    expect(statements.toLowerCase()).toMatch(/tired/)
    expect(payload.sessionContext.recentMessages.length).toBeGreaterThanOrEqual(6)
    expect(packet.facts.canonicalWorkout).toBe('Chest + Back')
    expect(session.topic?.workoutName).toBe('Chest + Back')
  })

  it('requestAvaChat records user turn before invoke and ava turn after success', async () => {
    const session = createAvaSession()
    const packet = buildPacket()
    const invoke = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        message: 'Keep Chest & Back short and hit the main lifts.',
        intent: 'workout',
        suggestedAction: null,
        followUpSuggestions: [],
        safetyLevel: 'normal',
      },
      error: null,
    })

    await requestAvaChat({
      message: "I'm feeling pretty tired today",
      packet,
      session,
      invoke,
    })

    const body = invoke.mock.calls[0][1].body
    expect(body.sessionContext.recentMessages.some((item) => item.role === 'user')).toBe(true)
    expect(body.sessionContext.recentMessages.at(-1).text).toContain('tired')
    expect(session.messages.some((item) => item.role === 'ava')).toBe(true)
    expect(session.lastRecommendation).toContain('Chest & Back')
  })
})

describe('avaSessionContext referent resolution context', () => {
  it('keeps soreness and workout context for "Would you still do it?"', () => {
    const session = createAvaSession()
    const packet = buildPacket()

    simulateTurn({
      session,
      packet,
      user: 'My front delt is a little sore.',
      ava: 'Noted — we can protect that shoulder and still train smart.',
    })

    recordUserTurn(session, 'Would you still do it?', { packet })
    const body = buildAvaChatRequestBody({
      message: 'Would you still do it?',
      packet,
      session,
    })

    const transcript = body.sessionContext.recentMessages.map((item) => item.text).join(' ')
    expect(transcript.toLowerCase()).toMatch(/front delt/)
    expect(transcript.toLowerCase()).toMatch(/would you still do it/)
    expect(session.topic?.workoutName).toBe('Chest + Back')
  })
})

describe('avaSessionContext trusted boundary', () => {
  it('stores subjective workout claim without changing trusted packet workout', () => {
    const session = createAvaSession()
    const packet = buildPacket()

    recordUserTurn(session, 'Actually today is legs.', { packet })
    recordUserTurn(session, 'So what am I training?', { packet })

    const body = buildAvaChatRequestBody({
      message: 'So what am I training?',
      packet,
      session,
    })

    expect(packet.facts.canonicalWorkout).toBe('Chest + Back')
    expect(body.sessionContext.recentMessages.some((item) => /legs/i.test(item.text))).toBe(
      true,
    )
    expect(body.message).toBe('So what am I training?')
  })
})

describe('avaSessionContext transaction routing regression', () => {
  it('does not capture nutrition logging as subjective session context', () => {
    expect(shouldCaptureSessionContext('I had a protein bar')).toBe(false)
    expect(
      shouldRunNutritionTool('I had a protein bar', {
        packet: buildPacket(),
        session: createAvaSession(),
      }),
    ).toBe(true)
  })
})
