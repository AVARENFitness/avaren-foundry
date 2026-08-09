import { describe, expect, it, vi } from 'vitest'
import { createAvaSession } from '../../lib/avaConversation'
import { buildAvaContextPacket } from '../../lib/avaContext'
import { runAvaMessagePipeline } from '../avaMessagePipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import { PLAN_CHANGE_ACTIONS, PROPOSAL_STATUS } from './avaPlanTypes'
import {
  attachSessionConstraints,
  buildPlanningContext,
} from './avaPlanningContext'
import {
  buildDailyPlan,
  buildPlanProposal,
  buildDailyPlanResponse,
} from './avaPlanProposal'
import {
  rejectUnknownProposalActions,
  validatePlanChange,
  validateProposal,
  isStaleProposal,
  canApplyProposal,
} from './avaPlanValidator'
import { applyPlanProposal } from './avaPlanExecutor'
import { verifyPlanApplied } from './avaPlanVerification'
import { runPlanningPipelineStep } from './avaPlanningPipeline'
import {
  getActivePlanProposal,
  setActivePlanProposal,
} from './avaPlanSession'
import { isAdaptivePlanningQuery, isDailyPlanQuery } from './avaPlanResolver'

const baseProgram = {
  rotation: ['Chest + Back', 'Arms', 'Legs + Core'],
  nextWorkout: 'Chest + Back',
  workouts: {
    'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
    'Legs + Core': [{ name: 'Squat', sets: 3, muscle: 'Legs' }],
  },
}

const weeklySchedule = {
  0: 'Rest',
  1: 'Chest + Back',
  2: 'Arms',
  3: 'Legs + Core',
  4: 'Chest + Back',
  5: 'Legs + Core',
  6: 'Rest',
}

const buildState = (overrides = {}) => ({
  program: baseProgram,
  selectedWorkout: 'Chest + Back',
  weeklySchedule,
  history: [],
  readiness: {
    entries: [
      {
        id: 'r1',
        date: '2026-08-06',
        sleep: 4,
        energy: 4,
        soreness: 2,
        stress: 2,
      },
    ],
  },
  ...overrides,
})

const buildRuntime = (state, applySpy = vi.fn()) => ({
  getPlanningState: () => ({
    weeklySchedule: state.weeklySchedule,
    program: state.program,
    history: state.history,
    readiness: state.readiness,
    activeWorkout: state.activeWorkout ?? null,
  }),
  applyPlanningChanges: applySpy,
})

describe('ava planning resolver', () => {
  it('detects daily and adaptive planning queries', () => {
    expect(isDailyPlanQuery('What should I do today?')).toBe(true)
    expect(isAdaptivePlanningQuery('I only have 30 minutes')).toBe(true)
    expect(isAdaptivePlanningQuery('I am traveling Friday')).toBe(true)
    expect(isAdaptivePlanningQuery('I missed yesterday')).toBe(true)
  })
})

describe('ava planning daily plan', () => {
  const now = new Date('2026-08-06T12:00:00.000Z')

  it('recommends the real scheduled workout for today', () => {
    const state = buildState()
    const context = buildPlanningContext({
      state,
      now,
      message: 'What should I do today?',
    })

    const daily = buildDailyPlan(context)
    expect(daily.workout).toBe('Chest + Back')
    expect(daily.primaryAction).toBe('train')

    const response = buildDailyPlanResponse(context)
    expect(response.message).toMatch(/Chest/i)
    expect(response.message).not.toMatch(/invented/i)
  })

  it('answers daily plan query deterministically through pipeline', async () => {
    const state = buildState({ weeklySchedule: { ...weeklySchedule, 4: 'Chest + Back' } })
    const session = createAvaSession()
    const packet = buildAvaContextPacket(state, { now: new Date('2026-08-06T12:00:00.000Z') })

    const outcome = await runPlanningPipelineStep({
      message: 'What should I do today?',
      session,
      packet,
      actionRuntime: buildRuntime(state),
      role: 'athlete',
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome.message).toMatch(/Chest/i)
  })
})

describe('ava planning constraints and proposals', () => {
  const thursday = new Date('2026-08-06T12:00:00.000Z')

  it('incorporates a 30-minute constraint without mutating schedule', () => {
    const state = buildState()
    let context = buildPlanningContext({
      state,
      now: thursday,
      message: 'I only have 30 minutes',
    })
    context = attachSessionConstraints(context, null, 'I only have 30 minutes')

    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })
    expect(proposal.changes.some((change) => change.action === PLAN_CHANGE_ACTIONS.SHORTEN_SESSION)).toBe(true)
    expect(proposal.proposedPlan.daily.sessionExecutionPlan?.maxMinutes).toBe(30)
    expect(proposal.requiresConfirmation).toBe(true)
  })

  it('proposes moving Friday legs when user is traveling Friday', () => {
    const state = buildState()
    let context = buildPlanningContext({
      state,
      now: thursday,
      message: "I'm traveling Friday",
    })
    context = attachSessionConstraints(context, null, "I'm traveling Friday")

    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })
    const move = proposal.changes.find((change) => change.action === PLAN_CHANGE_ACTIONS.MOVE_SESSION)
    expect(move?.fromDayIndex).toBe(5)
    expect(move?.targetSessionName).toBe('Legs + Core')
    expect(proposal.requiresConfirmation).toBe(true)
  })

  it('handles missed yesterday without stacking two full sessions', () => {
    const tuesday = new Date('2026-08-04T12:00:00.000Z')
    const state = buildState({
      weeklySchedule: { ...weeklySchedule, 1: 'Chest + Back', 2: 'Arms' },
      history: [],
    })

    let context = buildPlanningContext({
      state,
      now: tuesday,
      message: 'I missed yesterday',
    })
    context = attachSessionConstraints(context, null, 'I missed yesterday')

    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })
    const keep = proposal.changes.find(
      (change) => change.action === PLAN_CHANGE_ACTIONS.KEEP_PLAN_AS_IS,
    )
    expect(keep?.meta?.avoidStacking).toBe(true)
    expect(proposal.message.toLowerCase()).not.toMatch(/two full/)
  })

  it('protects coach-assigned content from schedule rewrite proposals', () => {
    const state = buildState()
    const assignment = {
      id: 'assign-1',
      title: 'Coach Lower',
      due_date: '2026-08-06',
      status: 'assigned',
      workout_payload: {
        exercises: [{ name: 'Trap Bar Deadlift', sets: 4, muscle: 'Legs' }],
      },
    }

    let context = buildPlanningContext({
      state,
      now: thursday,
      message: 'Make it easier',
      assignments: [assignment],
    })
    context = attachSessionConstraints(context, null, 'Make it easier')

    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })
    expect(proposal.coachProgramProtected).toBe(true)
    expect(
      proposal.changes.every(
        (change) =>
          change.action !== PLAN_CHANGE_ACTIONS.MOVE_SESSION ||
          change.meta?.scheduleOnly !== true,
      ),
    ).toBe(true)
    expect(
      proposal.changes.some(
        (change) =>
          change.action === PLAN_CHANGE_ACTIONS.SHORTEN_SESSION &&
          change.meta?.executionOnly === true,
      ),
    ).toBe(true)
  })
})

describe('ava planning validator', () => {
  it('rejects unknown model actions like DELETE_WORKOUT', () => {
    const result = rejectUnknownProposalActions([
      { action: 'DELETE_WORKOUT' },
      { action: PLAN_CHANGE_ACTIONS.SHORTEN_SESSION, value: 30 },
    ])

    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].action).toBe('DELETE_WORKOUT')
    expect(validatePlanChange({ action: 'DELETE_WORKOUT' }).ok).toBe(false)
  })
})

describe('ava planning apply flow', () => {
  const thursday = new Date('2026-08-06T12:00:00.000Z')

  it('applies allowlisted weekly schedule moves after confirmation', async () => {
    const state = buildState()
    const session = createAvaSession()
    const applySpy = vi.fn()

    let context = buildPlanningContext({
      state,
      now: thursday,
      message: "I'm traveling Friday",
    })
    context = attachSessionConstraints(context, null, "I'm traveling Friday")

    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })
    setActivePlanProposal(session, proposal)

    const outcome = await runPlanningPipelineStep({
      message: 'apply it',
      session,
      packet: buildAvaContextPacket(state, { now: thursday }),
      actionRuntime: buildRuntime(state, applySpy),
      role: 'athlete',
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(applySpy).toHaveBeenCalled()
    expect(getActivePlanProposal(session)).toBeNull()

    const appliedSchedule = applySpy.mock.calls[0][0].weeklySchedule
    expect(appliedSchedule[5]).toBe('Rest')
    expect(appliedSchedule[6]).toBe('Legs + Core')
  })

  it('cancels proposal without mutation', async () => {
    const state = buildState()
    const session = createAvaSession()
    const applySpy = vi.fn()

    const proposal = buildPlanProposal({
      context: attachSessionConstraints(
        buildPlanningContext({
          state,
          now: thursday,
          message: 'I only have 30 minutes',
        }),
        null,
        'I only have 30 minutes',
      ),
      intent: 'adaptive_plan',
    })
    setActivePlanProposal(session, proposal)

    const outcome = await runPlanningPipelineStep({
      message: 'keep it how it is',
      session,
      packet: buildAvaContextPacket(state, { now: thursday }),
      actionRuntime: buildRuntime(state, applySpy),
      role: 'athlete',
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.CANCELLED)
    expect(applySpy).not.toHaveBeenCalled()
    expect(getActivePlanProposal(session)).toBeNull()
  })

  it('rejects stale proposals after underlying plan changes', async () => {
    const state = buildState()
    const session = createAvaSession()
    const applySpy = vi.fn()

    const context = attachSessionConstraints(
      buildPlanningContext({
        state,
        now: thursday,
        message: "I'm traveling Friday",
      }),
      null,
      "I'm traveling Friday",
    )
    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })
    setActivePlanProposal(session, proposal)

    const mutatedState = {
      ...state,
      weeklySchedule: { ...state.weeklySchedule, 5: 'Rest', 3: 'Legs + Core' },
    }

    const outcome = await runPlanningPipelineStep({
      message: 'apply it',
      session,
      packet: buildAvaContextPacket(mutatedState, { now: thursday }),
      actionRuntime: buildRuntime(mutatedState, applySpy),
      role: 'athlete',
    })

    expect(outcome.message).toMatch(/changed since/i)
    expect(applySpy).not.toHaveBeenCalled()
  })
})

describe('ava planning verification', () => {
  it('verifies weekly schedule updates and session execution focus', () => {
    const session = createAvaSession()
    const proposal = {
      changes: [
        {
          action: PLAN_CHANGE_ACTIONS.MOVE_SESSION,
          fromDayIndex: 5,
          toDayIndex: 6,
          targetSessionName: 'Legs + Core',
        },
        {
          action: PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS,
          value: { maxMinutes: 30, priority: 'main_work' },
        },
      ],
    }

    const execution = applyPlanProposal({
      proposal,
      session,
      weeklySchedule: { ...weeklySchedule, 5: 'Legs + Core' },
    })

    expect(execution.ok).toBe(true)

    const verification = verifyPlanApplied({
      proposal,
      weeklySchedule: execution.weeklySchedule,
      session,
    })

    expect(verification.ok).toBe(true)
    expect(execution.weeklySchedule[6]).toBe('Legs + Core')
    expect(session.sessionExecutionPlan?.maxMinutes).toBe(30)
  })
})

describe('ava planning pipeline integration', () => {
  it('does not route simple start workout commands through planning', async () => {
    const state = buildState()
    const session = createAvaSession()
    const routeMessage = vi.fn()

    const outcome = await runAvaMessagePipeline({
      message: 'start my workout',
      nutrition: { goals: {}, days: {} },
      session,
      packet: buildAvaContextPacket(state, { now: new Date('2026-08-06T12:00:00.000Z') }),
      actionRuntime: buildRuntime(state),
      routeMessage,
      role: 'athlete',
    })

    expect(outcome.kind).not.toBe(AVA_PIPELINE_KIND.PLAN_PROPOSAL)
  })

  it('returns a plan proposal card payload for adaptive queries', async () => {
    const state = buildState()
    const session = createAvaSession()

    const outcome = await runPlanningPipelineStep({
      message: 'I only have 30 minutes — what would you do?',
      session,
      packet: buildAvaContextPacket(state, { now: new Date('2026-08-06T12:00:00.000Z') }),
      actionRuntime: buildRuntime(state),
      role: 'athlete',
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.PLAN_PROPOSAL)
    expect(outcome.planProposal?.status).toBe(PROPOSAL_STATUS.AWAITING_CONFIRMATION)
    expect(outcome.planProposal?.requiresConfirmation).toBe(true)
  })
})

describe('ava planning stale detection', () => {
  it('detects stale proposals from schedule hash drift', () => {
    const context = buildPlanningContext({
      state: buildState(),
      now: new Date('2026-08-06T12:00:00.000Z'),
    })
    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })

    expect(isStaleProposal(proposal, context)).toBe(false)

    const mutated = {
      ...context,
      weeklySchedule: { ...context.weeklySchedule, 5: 'Rest' },
    }

    expect(isStaleProposal(proposal, mutated)).toBe(true)
    expect(canApplyProposal(proposal, mutated).reason).toBe('stale')
  })
})

describe('ava planning proposal validation', () => {
  it('validates move collisions and missing targets', () => {
    const context = buildPlanningContext({
      state: buildState(),
      now: new Date('2026-08-06T12:00:00.000Z'),
    })

    const invalid = validatePlanChange(
      {
        action: PLAN_CHANGE_ACTIONS.MOVE_SESSION,
        fromDayIndex: 5,
        toDayIndex: 4,
      },
      context,
    )

    expect(invalid.ok).toBe(false)
    expect(invalid.reason).toBe('destination_collision')

    const proposal = {
      changes: [
        {
          action: PLAN_CHANGE_ACTIONS.SHORTEN_SESSION,
          target: 'today',
          value: 30,
        },
      ],
    }

    expect(validateProposal(proposal, context).ok).toBe(true)
  })
})
