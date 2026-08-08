import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { buildAvaContextPacket } from '../../lib/avaContext'
import { createAvaSession } from '../../lib/avaConversation'
import { runAvaMessagePipeline } from '../avaMessagePipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import {
  executeAvaAction,
  resetAvaActionIdempotency,
} from './avaActionExecutor'
import {
  resolveExplicitAction,
  resolveModelProposedAction,
  resolveReferentAction,
} from './avaActionResolver'
import {
  referentFromRecoveryContext,
  referentFromWorkoutContext,
  setSessionActiveReferent,
  updateReferentFromConversation,
} from './avaActionReferent'
import { AVA_ACTION_IDS } from './avaActionTypes'
import { orchestrateUiAction } from './avaActionOrchestrator'

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

const buildPacket = () =>
  buildAvaContextPacket(readyState, {
    userName: 'Jacob',
    now: new Date(`${today}T18:00:00`),
  })

const createMockRuntime = (overrides = {}) => {
  const calls = {
    startWorkout: 0,
    openReadiness: 0,
    openNutrition: 0,
    openRecovery: 0,
    startRecoveryFlow: 0,
  }

  const snapshot = {
    screen: 'home',
    activeWorkout: null,
    showReadinessCheckIn: false,
    ...overrides.snapshot,
  }

  const runtime = {
    startWorkout: () => {
      calls.startWorkout += 1
      snapshot.screen = 'gym'
      snapshot.activeWorkout = { name: 'Chest + Back' }
    },
    openReadiness: () => {
      calls.openReadiness += 1
      snapshot.showReadinessCheckIn = true
    },
    openNutrition: () => {
      calls.openNutrition += 1
      snapshot.screen = 'nutrition'
    },
    openRecovery: () => {
      calls.openRecovery += 1
      snapshot.screen = 'mobility'
    },
    startRecoveryFlow: () => {
      calls.startRecoveryFlow += 1
      snapshot.screen = 'mobility'
    },
    onNavigateIntent: (destination) => {
      snapshot.screen = destination
    },
    getSnapshot: () => snapshot,
    ...overrides.handlers,
  }

  return { runtime, calls, snapshot }
}

describe('avaActionResolver 7.8.1', () => {
  it('resolves open my readiness explicitly', () => {
    const resolution = resolveExplicitAction('open my readiness', {
      session: createAvaSession(),
      packet: buildPacket(),
    })

    expect(resolution?.actionId).toBe(AVA_ACTION_IDS.OPEN_READINESS)
    expect(resolution?.executeImmediately).toBe(true)
  })

  it('resolves referent start from activeReferent workout only', () => {
    const session = createAvaSession()
    setSessionActiveReferent(session, referentFromWorkoutContext({ workoutName: 'Chest + Back' }))

    const resolution = resolveReferentAction('Start it.', { session, packet: buildPacket() })

    expect(resolution?.actionId).toBe(AVA_ACTION_IDS.START_TODAYS_WORKOUT)
  })

  it('asks for clarification when no activeReferent exists', () => {
    const resolution = resolveReferentAction('Start it.', {
      session: createAvaSession(),
      packet: buildPacket(),
    })

    expect(resolution?.ambiguous).toBe(true)
    expect(resolution?.actionId).toBeNull()
  })

  it('rejects unknown model action IDs', () => {
    const resolution = resolveModelProposedAction(
      { id: 'DELETE_ACCOUNT' },
      { packet: buildPacket() },
    )

    expect(resolution?.rejected).toBe(true)
  })
})

describe('avaActionReferent 7.8.1', () => {
  it('replaces stale recovery referent when workout becomes the topic', () => {
    const session = createAvaSession()
    setSessionActiveReferent(session, referentFromRecoveryContext())

    updateReferentFromConversation({
      session,
      packet: buildPacket(),
      message: 'What workout do I have today?',
      avaMessage: 'Chest & Back is up today.',
    })

    expect(session.activeReferent?.entityType).toBe('workout')
    expect(session.activeReferent?.actionId).toBe(AVA_ACTION_IDS.START_TODAYS_WORKOUT)
  })

  it('start it resolves to workout after workout discussion supersedes recovery', () => {
    const session = createAvaSession()
    setSessionActiveReferent(session, referentFromRecoveryContext())

    updateReferentFromConversation({
      session,
      packet: buildPacket(),
      message: 'What workout do I have today?',
      avaMessage: 'Chest & Back is up today.',
    })

    const resolution = resolveReferentAction('Start it.', { session, packet: buildPacket() })
    expect(resolution?.actionId).toBe(AVA_ACTION_IDS.START_TODAYS_WORKOUT)
  })
})

describe('avaActionExecutor 7.8.1', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
  })

  it('verifies nutrition navigation before success', async () => {
    const { runtime, calls, snapshot } = createMockRuntime()

    const result = await executeAvaAction({
      actionId: AVA_ACTION_IDS.OPEN_NUTRITION,
      runtime,
      requestId: 'nutrition-open',
    })

    expect(result.ok).toBe(true)
    expect(calls.openNutrition).toBe(1)
    expect(snapshot.screen).toBe('nutrition')
  })

  it('reports failure when destination never becomes active', async () => {
    const runtime = {
      openNutrition: () => {},
      getSnapshot: () => ({ screen: 'home', showReadinessCheckIn: false }),
    }

    const result = await executeAvaAction({
      actionId: AVA_ACTION_IDS.OPEN_NUTRITION,
      runtime,
    })

    expect(result.ok).toBe(false)
    expect(result.message.toLowerCase()).toMatch(/couldn't open/)
  })

  it('deduplicates rapid duplicate taps', async () => {
    const { runtime, calls } = createMockRuntime()

    await executeAvaAction({
      actionId: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
      runtime,
      requestId: 'dup-test',
    })
    await executeAvaAction({
      actionId: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
      runtime,
      requestId: 'dup-test',
    })

    expect(calls.startWorkout).toBe(1)
  })
})

describe('avaMessagePipeline action orchestration 7.8.1', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
  })

  it('opens readiness deterministically before model routing', async () => {
    const { runtime, calls, snapshot } = createMockRuntime()
    const routeMessage = vi.fn()

    const outcome = await runAvaMessagePipeline({
      message: 'open my readiness',
      nutrition: readyState.nutrition,
      session: createAvaSession(),
      packet: buildPacket(),
      routeMessage,
      actionRuntime: runtime,
    })

    expect(routeMessage).not.toHaveBeenCalled()
    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(calls.openReadiness).toBe(1)
    expect(snapshot.showReadinessCheckIn).toBe(true)
  })

  it('opens nutrition only when verification passes', async () => {
    const { runtime, calls, snapshot } = createMockRuntime()
    const routeMessage = vi.fn()

    const outcome = await runAvaMessagePipeline({
      message: 'open nutrition',
      nutrition: readyState.nutrition,
      session: createAvaSession(),
      packet: buildPacket(),
      routeMessage,
      actionRuntime: runtime,
    })

    expect(routeMessage).not.toHaveBeenCalled()
    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(calls.openNutrition).toBe(1)
    expect(snapshot.screen).toBe('nutrition')
  })

  it('keeps tired statements conversational', async () => {
    const routeMessage = vi.fn().mockResolvedValue({
      source: 'model',
      summary: "I'd keep effort conservative today.",
      actions: [],
      suggestions: [],
    })

    const outcome = await runAvaMessagePipeline({
      message: "I'm tired today.",
      nutrition: readyState.nutrition,
      session: createAvaSession(),
      packet: buildPacket(),
      routeMessage,
      actionRuntime: createMockRuntime().runtime,
    })

    expect(routeMessage).toHaveBeenCalled()
    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
  })

  it('does not regress nutrition logging', async () => {
    const routeMessage = vi.fn()

    const outcome = await runAvaMessagePipeline({
      message: 'I had a protein bar',
      nutrition: readyState.nutrition,
      session: createAvaSession(),
      packet: buildPacket(),
      routeMessage,
      actionRuntime: createMockRuntime().runtime,
    })

    expect(routeMessage).not.toHaveBeenCalled()
    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.CLARIFICATION)
  })

  it('does not regress nutrition query routing', async () => {
    const routeMessage = vi.fn()

    const outcome = await runAvaMessagePipeline({
      message: 'How much protein have I had today?',
      nutrition: readyState.nutrition,
      session: createAvaSession(),
      packet: buildPacket(),
      routeMessage,
      actionRuntime: createMockRuntime().runtime,
    })

    expect(routeMessage).not.toHaveBeenCalled()
    expect(outcome.message.toLowerCase()).toMatch(/protein|logged|enough/)
  })
})

describe('avaAction UI orchestration 7.8.1', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
  })

  it('executes action from UI chip tap', async () => {
    const { runtime, calls } = createMockRuntime()

    const outcome = await orchestrateUiAction({
      actionId: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
      runtime,
      packet: buildPacket(),
      session: createAvaSession(),
      requestId: 'ui-chip',
    })

    expect(outcome.kind).toBe('action_success')
    expect(outcome.navigated).toBe(true)
    expect(calls.startWorkout).toBe(1)
  })
})
