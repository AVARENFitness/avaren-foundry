import { describe, expect, it, vi } from 'vitest'
import AvaService from '../ava/AvaService'
import { buildAvaContextPacket } from './avaContext'
import {
  createAvaSession,
  respondToAvaMessage,
} from './avaConversation'
import {
  buildAvaChatRequestBody,
} from './avaModelContext'
import {
  AVA_TRUST_LEVELS,
  buildTrustedModelContext,
  buildTrustedReadiness,
  extractSessionContext,
  resolveAuthenticatedUserId,
  resolveTrustedWorkoutContext,
} from './avaTrustedContext'

const today = new Date().toISOString().slice(0, 10)
const AUTH_USER = 'user-authenticated-123'
const OTHER_USER = 'user-attacker-999'

const foundryState = {
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
  selectedWorkout: 'Legs',
  program: {
    nextWorkout: 'Legs',
    workouts: {
      'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
      Legs: [{ name: 'Squat', sets: 3, muscle: 'Quad' }],
    },
  },
  weeklySchedule: ['Rest', 'Chest + Back', 'Arms', 'Legs', 'Chest + Back', 'Arms', 'Rest'],
  mobility: {
    completed: [
      { flowId: 'daily-reset', completedAt: `${today}T07:00:00` },
    ],
  },
  nutrition: {
    goals: { calories: 2200, protein: 170 },
    days: {},
  },
}

const chestAssignment = {
  id: 'assign-1',
  status: 'assigned',
  title: 'Chest and Back',
  due_date: today,
  coach_notes: 'Keep effort controlled.',
  workout_payload: {
    name: 'Chest & Back',
    exercises: [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
  },
}

describe('avaTrustedContext security boundary', () => {
  it('CASE 1: ignores spoofed readiness and uses trusted server value', () => {
    const readiness = buildTrustedReadiness(foundryState, new Date(`${today}T12:00:00`))
    expect(readiness.completed).toBe(true)
    expect(readiness.score).toBeGreaterThanOrEqual(55)
    expect(readiness.score).toBeLessThanOrEqual(70)

    const trusted = buildTrustedModelContext({
      authenticatedUserId: AUTH_USER,
      foundryState,
      serverAssignments: [],
      sessionContext: extractSessionContext({}),
      clientHints: { trust: AVA_TRUST_LEVELS.CLIENT_HINTS },
      now: new Date(`${today}T12:00:00`),
    })

    expect(trusted.serverFacts.trustedToday.readiness.score).toBe(readiness.score)
    expect(trusted.serverFacts.trustedToday.readiness.score).not.toBe(100)
  })

  it('CASE 2: server coach assignment overrides client workout spoof', () => {
    const workout = resolveTrustedWorkoutContext(
      foundryState,
      [chestAssignment],
      new Date(`${today}T12:00:00`),
    )

    expect(workout.name).toBe('Chest & Back')
    expect(workout.source).toBe('coach-assignment')

    const trusted = buildTrustedModelContext({
      authenticatedUserId: AUTH_USER,
      foundryState,
      serverAssignments: [chestAssignment],
      sessionContext: extractSessionContext({
        context: {
          today: { canonicalWorkout: 'Legs' },
        },
      }),
      clientHints: {},
      now: new Date(`${today}T12:00:00`),
    })

    expect(trusted.serverFacts.trustedToday.canonicalWorkout).toBe('Chest & Back')
    expect(trusted.serverFacts.trustedToday.canonicalWorkout).not.toBe('Legs')
  })

  it('CASE 3: rejects spoofed user identity in payload', () => {
    const identity = resolveAuthenticatedUserId(AUTH_USER, {
      athleteId: OTHER_USER,
      userId: OTHER_USER,
    })

    expect(identity.userId).toBe(AUTH_USER)
    expect(identity.rejectedSpoofedIdentity).toBe(true)
  })

  it('CASE 4: preserves trusted readiness alongside subjective exhaustion', () => {
    const highReadinessState = {
      ...foundryState,
      readiness: {
        entries: [
          {
            id: 'ready-1',
            date: today,
            sleep: 5,
            energy: 5,
            soreness: 1,
            stress: 1,
          },
        ],
      },
    }

    const sessionContext = extractSessionContext({
      sessionContext: {
        userStatements: ["I'm exhausted."],
        temporaryConstraints: ["I'm exhausted."],
        recentMessages: [
          { role: 'user', text: "I'm exhausted." },
        ],
      },
    })

    const trusted = buildTrustedModelContext({
      authenticatedUserId: AUTH_USER,
      foundryState: highReadinessState,
      serverAssignments: [],
      sessionContext,
      clientHints: {},
      now: new Date(`${today}T12:00:00`),
    })

    expect(trusted.serverFacts.trustedToday.readiness.score).toBeGreaterThanOrEqual(82)
    expect(trusted.sessionContext.userStatements).toContain("I'm exhausted.")
    expect(trusted.sessionContext.temporaryConstraints).toContain("I'm exhausted.")
  })

  it('CASE 5: athlete-safe context excludes private coach fields', () => {
    const assignmentWithPrivateFields = {
      ...chestAssignment,
      privateCoachReview: 'Needs deload next week.',
      coach_client_notes: 'Athlete struggling with adherence.',
      weekly_review: { notes: 'Private weekly review content.' },
    }

    const trusted = buildTrustedModelContext({
      authenticatedUserId: AUTH_USER,
      foundryState,
      serverAssignments: [assignmentWithPrivateFields],
      sessionContext: extractSessionContext({}),
      clientHints: {},
      now: new Date(`${today}T12:00:00`),
    })

    const serialized = JSON.stringify(trusted)
    expect(serialized).not.toContain('privateCoachReview')
    expect(serialized).not.toContain('Needs deload')
    expect(serialized).not.toContain('coach_client_notes')
    expect(serialized).not.toContain('weekly_review')
    expect(serialized).not.toContain('Private weekly review')
    expect(trusted.serverFacts.trustedToday.coachAssignment?.athleteNotes).toBe(
      'Keep effort controlled.',
    )
  })

  it('CASE 6: deterministic fallback still works when model unavailable', async () => {
    const service = new AvaService()
    const packet = buildAvaContextPacket(foundryState, {
      userName: 'Jacob',
      now: new Date(`${today}T18:00:00`),
      assignments: [chestAssignment],
    })

    const response = await service.analyzeMessage('my front delt is hurting', {
      packet,
      session: createAvaSession(),
      invokeAvaChat: vi.fn().mockResolvedValue({
        data: { ok: false, reason: 'model-not-configured' },
        error: null,
      }),
    })

    expect(response.source).toBe('deterministic')
    expect(response.summary.toLowerCase()).toContain('got you')
  })
})

describe('avaTrustedContext client contract', () => {
  it('does not send authoritative context fields in chat request body', () => {
    const packet = buildAvaContextPacket(foundryState, {
      userName: 'Jacob',
      now: new Date(`${today}T18:00:00`),
    })
    const session = createAvaSession()
    session.addConstraint("I'm tired")

    const body = buildAvaChatRequestBody({
      message: "I'm tired",
      session,
      packet,
      now: new Date(`${today}T18:00:00`),
    })

    expect(body.message).toBe("I'm tired")
    expect(body.sessionContext).toBeDefined()
    expect(body.clientHints?.daypart).toBeDefined()
    expect(body.context).toBeUndefined()
    expect(body.readiness).toBeUndefined()
    expect(body.userId).toBeUndefined()
  })

  it('deterministic path still uses local packet', () => {
    const packet = buildAvaContextPacket(foundryState, {
      userName: 'Jacob',
      now: new Date(`${today}T18:00:00`),
      assignments: [chestAssignment],
    })

    const response = respondToAvaMessage({
      message: 'Should I still do it?',
      packet,
      session: createAvaSession(),
    })

    expect(response.summary).toContain('Chest & Back')
  })
})
