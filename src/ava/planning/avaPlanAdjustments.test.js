import { describe, expect, it, vi } from 'vitest'
import { createAvaSession } from '../../lib/avaConversation'
import { buildAvaContextPacket } from '../../lib/avaContext'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import { PLAN_CHANGE_ACTIONS } from './avaPlanTypes'
import {
  attachSessionConstraints,
  buildPlanningContext,
} from './avaPlanningContext'
import { buildPlanProposal } from './avaPlanProposal'
import {
  isCoachProgramMutationRequest,
  isPainExecutionRequest,
} from './avaPlanPolicy'
import { applyPlanProposal, undoLastPlanChange } from './avaPlanExecutor'
import { runPlanningPipelineStep } from './avaPlanningPipeline'
import {
  getActivePlanProposal,
  setActivePlanProposal,
} from './avaPlanSession'
import { PRIORITY_MODE } from '../../lib/sessionExecutionPlan'
import { buildPlanningOwnership } from '../../lib/planOwnership'

const baseProgram = {
  rotation: ['Chest + Back', 'Arms', 'Legs + Core'],
  nextWorkout: 'Chest + Back',
  workouts: {
    'Chest + Back': [
      { name: 'Bench Press', sets: 4, muscle: 'Chest' },
      { name: 'Lat Pulldown', sets: 3, muscle: 'Back' },
      { name: 'Cable Fly', sets: 3, muscle: 'Chest' },
    ],
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
  readiness: { entries: [] },
  sessionExecutionPlan: null,
  ...overrides,
})

const coachAssignment = {
  id: 'assign-coach-1',
  title: 'Coach Chest & Back',
  due_date: '2026-08-06',
  scheduled_date: '2026-08-06',
  status: 'assigned',
  workout_payload: {
    exercises: [
      { name: 'Bench Press', sets: 4, muscle: 'Chest' },
      { name: 'Lat Pulldown', sets: 3, muscle: 'Back' },
      { name: 'Face Pull', sets: 3, muscle: 'Back' },
    ],
  },
}

const buildRuntime = (state, applySpy = vi.fn()) => ({
  getPlanningState: () => ({
    weeklySchedule: state.weeklySchedule,
    program: state.program,
    history: state.history,
    readiness: state.readiness,
    activeWorkout: state.activeWorkout ?? null,
    sessionExecutionPlan: state.sessionExecutionPlan ?? null,
    assignments: state.assignments ?? [],
  }),
  applyPlanningChanges: async (changes) => {
    applySpy(changes)
    if (changes.weeklySchedule) {
      state.weeklySchedule = changes.weeklySchedule
    }
    if (changes.sessionExecutionPlan !== undefined) {
      state.sessionExecutionPlan = changes.sessionExecutionPlan
    }
  },
})

describe('ava plan adjustments — ownership and policy', () => {
  const thursday = new Date('2026-08-06T12:00:00.000Z')

  it('classifies coached sessions as coach-owned programming', () => {
    const context = buildPlanningContext({
      state: buildState(),
      now: thursday,
      assignments: [coachAssignment],
    })

    expect(context.ownership.programmingOwner).toBe('coach')
    expect(context.ownership.coachAssigned).toBe(true)
    expect(context.ownership.scheduleControlledByCoach).toBe(true)
  })

  it('allows solo athletes without coach ownership language triggers', () => {
    const context = buildPlanningContext({
      state: buildState(),
      now: thursday,
    })

    expect(buildPlanningOwnership({ todayWorkout: context.todayWorkout }).coachAssigned).toBe(false)
  })

  it('rejects coach program mutation requests through pipeline', async () => {
    const state = buildState()
    const session = createAvaSession()

    const outcome = await runPlanningPipelineStep({
      message: 'Take bench press out',
      session,
      packet: buildAvaContextPacket(state, {
        now: thursday,
        assignments: [coachAssignment],
      }),
      actionRuntime: buildRuntime(state),
      role: 'athlete',
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome.message).toMatch(/coach/i)
    expect(outcome.message).toMatch(/unchanged/i)
    expect(isCoachProgramMutationRequest('Take bench press out')).toBe(true)
  })

  it('responds safely to pain without diagnosis or silent program change', async () => {
    const state = buildState()
    const session = createAvaSession()

    const outcome = await runPlanningPipelineStep({
      message: 'My shoulder hurts on bench press',
      session,
      packet: buildAvaContextPacket(state, {
        now: thursday,
        assignments: [coachAssignment],
      }),
      actionRuntime: buildRuntime(state),
      role: 'athlete',
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome.message).toMatch(/stop/i)
    expect(outcome.message).not.toMatch(/diagnos/i)
    expect(isPainExecutionRequest('My shoulder hurts on bench press', [
      { name: 'Bench Press' },
    ])).toBe(true)
    expect(isPainExecutionRequest('I am sore today', [])).toBe(false)
  })
})

describe('ava plan adjustments — execution focus', () => {
  const thursday = new Date('2026-08-06T12:00:00.000Z')

  it('proposes 30-minute focus with priority exercises for coached athlete', () => {
    const state = buildState()
    let context = buildPlanningContext({
      state,
      now: thursday,
      message: 'I only have 30 minutes',
      assignments: [coachAssignment],
    })
    context = attachSessionConstraints(context, null, 'I only have 30 minutes')

    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })
    const plan = proposal.proposedPlan.daily.sessionExecutionPlan

    expect(plan.maxMinutes).toBe(30)
    expect(plan.priorityMode).toBe(PRIORITY_MODE.MAIN_WORK)
    expect(plan.priorityExerciseNames).toContain('Bench Press')
    expect(proposal.coachProgramProtected).toBe(true)
  })

  it('uses minimum-effective mode for 15 minutes', () => {
    const state = buildState()
    let context = buildPlanningContext({
      state,
      now: thursday,
      message: 'I only have 15 minutes',
    })
    context = attachSessionConstraints(context, null, 'I only have 15 minutes')

    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })
    expect(proposal.proposedPlan.daily.sessionExecutionPlan.priorityMode).toBe(
      PRIORITY_MODE.MINIMUM_EFFECTIVE,
    )
  })

  it('applies and persists execution focus after confirmation', async () => {
    const state = buildState()
    const session = createAvaSession()
    const applySpy = vi.fn()

    let context = buildPlanningContext({
      state,
      now: thursday,
      message: 'I only have 30 minutes',
      assignments: [coachAssignment],
    })
    context = attachSessionConstraints(context, null, 'I only have 30 minutes')
    setActivePlanProposal(session, buildPlanProposal({ context, intent: 'adaptive_plan' }))

    const outcome = await runPlanningPipelineStep({
      message: 'apply it',
      session,
      packet: buildAvaContextPacket(state, {
        now: thursday,
        assignments: [coachAssignment],
      }),
      actionRuntime: buildRuntime(state, applySpy),
      role: 'athlete',
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(outcome.message).toMatch(/Done/i)
    expect(state.sessionExecutionPlan?.maxMinutes).toBe(30)
    expect(getActivePlanProposal(session)).toBeNull()
  })

  it('undoes execution focus safely', async () => {
    const state = buildState({
      sessionExecutionPlan: {
        workoutName: 'Chest + Back',
        date: '2026-08-06',
        maxMinutes: 30,
        priorityMode: PRIORITY_MODE.MAIN_WORK,
        priorityExerciseNames: ['Bench Press'],
        accessoryExerciseNames: [],
        createdAt: thursday.toISOString(),
        expiresAt: '2026-08-06T23:59:59.999Z',
      },
    })
    const session = createAvaSession()
    session.lastPlanRollback = {
      action: PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS,
      previousExecutionPlan: null,
    }

    const undo = undoLastPlanChange({ session, weeklySchedule: state.weeklySchedule })
    expect(undo.ok).toBe(true)
    expect(session.sessionExecutionPlan).toBeNull()
  })
})

describe('ava plan adjustments — schedule boundaries', () => {
  const thursday = new Date('2026-08-06T12:00:00.000Z')

  it('blocks coach-locked schedule moves with coach-required messaging', async () => {
    const state = buildState()
    const session = createAvaSession()

    let context = buildPlanningContext({
      state,
      now: thursday,
      message: "I can't train Friday",
      assignments: [coachAssignment],
    })
    context = attachSessionConstraints(context, null, "I can't train Friday")

    const proposal = buildPlanProposal({ context, intent: 'adaptive_plan' })
    const move = proposal.changes.find(
      (change) => change.action === PLAN_CHANGE_ACTIONS.MOVE_SESSION,
    )

    expect(move).toBeUndefined()

    const outcome = await runPlanningPipelineStep({
      message: "Move Friday's workout to Thursday",
      session,
      packet: buildAvaContextPacket(state, {
        now: thursday,
        assignments: [coachAssignment],
      }),
      actionRuntime: buildRuntime(state),
      role: 'athlete',
    })

    if (outcome.planProposal) {
      expect(
        outcome.planProposal.changes.some(
          (change) => change.action === PLAN_CHANGE_ACTIONS.MOVE_SESSION,
        ),
      ).toBe(false)
    }
  })

  it('rejects stale proposals when coach assignment changes', async () => {
    const state = buildState()
    const session = createAvaSession()
    const applySpy = vi.fn()

    let context = buildPlanningContext({
      state,
      now: thursday,
      message: 'I only have 30 minutes',
      assignments: [coachAssignment],
    })
    context = attachSessionConstraints(context, null, 'I only have 30 minutes')
    setActivePlanProposal(session, buildPlanProposal({ context, intent: 'adaptive_plan' }))

    const mutatedPacket = buildAvaContextPacket(state, {
      now: thursday,
      assignments: [{ ...coachAssignment, id: 'assign-coach-2' }],
    })

    const outcome = await runPlanningPipelineStep({
      message: 'apply it',
      session,
      packet: mutatedPacket,
      actionRuntime: buildRuntime(state, applySpy),
      role: 'athlete',
    })

    expect(outcome.message).toMatch(/coach updated the plan/i)
    expect(applySpy).not.toHaveBeenCalled()
  })
})

describe('ava plan adjustments — session metadata', () => {
  it('attachExecutionMetadataToSession preserves programmed scope', async () => {
    const { attachExecutionMetadataToSession } = await import(
      '../../lib/sessionExecutionPlan'
    )

    const session = attachExecutionMetadataToSession(
      { id: 's1', name: 'Chest + Back', sets: [] },
      {
        maxMinutes: 30,
        priorityMode: PRIORITY_MODE.MAIN_WORK,
        coachAssigned: true,
      },
    )

    expect(session.executionMetadata.programmedScope).toBe('full_session')
    expect(session.executionMetadata.coachProgramPreserved).toBe(true)
  })

  it('applyPlanProposal does not mutate weekly schedule for shorten-only proposals', () => {
    const session = createAvaSession()
    const proposal = buildPlanProposal({
      context: attachSessionConstraints(
        buildPlanningContext({
          state: buildState(),
          now: new Date('2026-08-06T12:00:00.000Z'),
          message: 'I only have 30 minutes',
        }),
        null,
        'I only have 30 minutes',
      ),
      intent: 'adaptive_plan',
    })

    const execution = applyPlanProposal({
      proposal,
      session,
      weeklySchedule,
      context: buildPlanningContext({
        state: buildState(),
        now: new Date('2026-08-06T12:00:00.000Z'),
      }),
    })

    expect(execution.weeklySchedule).toEqual(weeklySchedule)
    expect(execution.sessionExecutionPlan?.maxMinutes).toBe(30)
  })
})
