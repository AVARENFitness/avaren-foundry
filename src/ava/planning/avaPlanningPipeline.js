import {
  AVA_PIPELINE_KIND,
  createPipelineOutcome,
} from '../avaPipelineOutcome'
import {
  buildDailyPlanResponse,
  buildPlanProposal,
  explainProposal,
} from './avaPlanProposal'
import {
  attachSessionConstraints,
  buildPlanningContext,
} from './avaPlanningContext'
import { applyPlanProposal, recordPlanRollback, undoLastPlanChange } from './avaPlanExecutor'
import {
  resolvePlanningIntent,
  shouldRoutePlanningMessage,
} from './avaPlanResolver'
import {
  cancelActivePlanProposal,
  clearActivePlanProposal,
  getActivePlanProposal,
  logAvaPlanApplyDiagnostic,
  logAvaPlanDiagnostic,
  markActiveProposalApplied,
  setActivePlanProposal,
} from './avaPlanSession'
import { canApplyProposal, validateProposal } from './avaPlanValidator'
import { buildApplySuccessMessage, verifyPlanApplied } from './avaPlanVerification'
import { PROPOSAL_STATUS } from './avaPlanTypes'
import { hasActivePendingTransaction, isAwaitingConfirmation } from '../avaTransactionState'
import {
  buildCoachRequiredResponse,
  buildPainExecutionResponse,
  extractMentionedExercise,
  isCoachProgramMutationRequest,
  isPainExecutionRequest,
} from './avaPlanPolicy'

const planningStateFromRuntime = (runtime = null) => {
  const snapshot = runtime?.getPlanningState?.() ?? {}
  return {
    weeklySchedule: snapshot.weeklySchedule ?? {},
    program: snapshot.program ?? null,
    history: snapshot.history ?? [],
    readiness: snapshot.readiness ?? {},
    activeWorkout: snapshot.activeWorkout ?? null,
    sessionExecutionPlan: snapshot.sessionExecutionPlan ?? null,
    assignments: snapshot.assignments ?? [],
  }
}

export async function runPlanningPipelineStep({
  message,
  session,
  packet,
  actionRuntime = null,
  role = 'athlete',
} = {}) {
  if (role === 'coach') return null
  if (hasActivePendingTransaction(session) || isAwaitingConfirmation(session)) {
    return null
  }

  const state = planningStateFromRuntime(actionRuntime)
  const planningNow = packet?.generatedAt
    ? new Date(packet.generatedAt)
    : new Date()

  let context = buildPlanningContext({
    state,
    packet,
    session,
    assignments: packet?.assignments ?? state.assignments ?? [],
    message,
    now: planningNow,
  })
  context = attachSessionConstraints(context, session, message)

  if (
    isCoachProgramMutationRequest(message) &&
    context.ownership?.coachAssigned
  ) {
    const response = buildCoachRequiredResponse({
      exerciseName: extractMentionedExercise(message, context.workoutExercises),
      ownership: context.ownership,
    })
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: response.message,
      readOnly: true,
      raw: response,
    })
  }

  if (
    isPainExecutionRequest(message, context.workoutExercises) &&
    context.workoutExercises?.length
  ) {
    const response = buildPainExecutionResponse({
      exerciseName: extractMentionedExercise(message, context.workoutExercises),
      ownership: context.ownership,
    })
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: response.message,
      readOnly: true,
      raw: response,
    })
  }

  if (!shouldRoutePlanningMessage(message, session)) return null

  const intent = resolvePlanningIntent(message, session)
  if (!intent) return null

  if (intent.intent === 'undo_plan') {
    const undo = undoLastPlanChange({
      session,
      weeklySchedule: state.weeklySchedule,
    })

    if (!undo.ok) {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.RESPONSE,
        message: 'Nothing to undo from the last plan change.',
        readOnly: true,
      })
    }

    await actionRuntime?.applyPlanningChanges?.({
      weeklySchedule: undo.weeklySchedule,
      sessionExecutionPlan: undo.sessionExecutionPlan ?? null,
    })

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.ACTION_SUCCESS,
      message: undo.message,
      raw: { source: 'plan-undo' },
    })
  }

  if (intent.intent === 'cancel_proposal') {
    cancelActivePlanProposal(session)
    logAvaPlanDiagnostic({
      type: 'cancel',
      status: PROPOSAL_STATUS.CANCELLED,
      source: 'user',
    })
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.CANCELLED,
      message: 'Keeping your current plan.',
      raw: { source: 'plan-cancel' },
    })
  }

  if (intent.intent === 'apply_proposal') {
    const proposal = getActivePlanProposal(session)
    if (!proposal) {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.RESPONSE,
        message: 'There is no plan waiting to apply.',
        readOnly: true,
      })
    }

    const applyCheck = canApplyProposal(proposal, context)
    logAvaPlanApplyDiagnostic({
      proposalIdPresent: Boolean(proposal.id),
      actionCount: proposal.changes?.length ?? 0,
      verified: false,
      stale: applyCheck.reason === 'stale',
    })

    if (!applyCheck.ok) {
      if (applyCheck.stale) {
        clearActivePlanProposal(session)
        return createPipelineOutcome({
          kind: AVA_PIPELINE_KIND.RESPONSE,
          message: context.ownership?.coachAssigned
            ? 'Your coach updated the plan since I made that suggestion. I\'ll use the new plan instead.'
            : 'Your plan changed since I made that suggestion. Let me refresh it.',
          readOnly: true,
          raw: { stale: true },
        })
      }

      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
        message:
          applyCheck.validation?.message ??
          "I couldn't apply that plan safely. Let's refresh it.",
        raw: applyCheck,
      })
    }

    const execution = applyPlanProposal({
      proposal,
      session,
      weeklySchedule: state.weeklySchedule,
      context,
    })

    if (!execution.ok) {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
        message: "I couldn't apply that plan change.",
        raw: execution,
      })
    }

    await actionRuntime?.applyPlanningChanges?.({
      weeklySchedule: execution.weeklySchedule,
      sessionExecutionPlan: execution.sessionExecutionPlan,
    })

    const verification = verifyPlanApplied({
      proposal,
      weeklySchedule: execution.weeklySchedule,
      session,
      sessionExecutionPlan: execution.sessionExecutionPlan,
    })

    logAvaPlanApplyDiagnostic({
      proposalIdPresent: Boolean(proposal.id),
      actionCount: execution.appliedChanges?.length ?? 0,
      verified: verification.ok,
      stale: false,
    })

    if (!verification.ok) {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
        message: buildApplySuccessMessage(proposal, verification),
        raw: { verification },
      })
    }

    if (execution.rollbacks?.[0]) {
      recordPlanRollback(session, execution.rollbacks[0])
    }

    markActiveProposalApplied(session, proposal)

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.ACTION_SUCCESS,
      message: buildApplySuccessMessage(proposal, verification),
      raw: {
        source: 'plan-apply',
        proposalId: proposal.id,
        verified: true,
      },
    })
  }

  if (intent.intent === 'explain_proposal') {
    const proposal = getActivePlanProposal(session)
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: explainProposal(proposal),
      readOnly: true,
      planProposal: proposal,
    })
  }

  if (intent.intent === 'daily_plan' && !(context.constraints?.length)) {
    const response = buildDailyPlanResponse(context)
    logAvaPlanDiagnostic({
      type: 'daily',
      status: 'response',
      source: 'deterministic',
    })
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: response.message,
      actions: response.actions,
      readOnly: true,
      raw: { dailyPlan: response.dailyPlan },
    })
  }

  const proposal = buildPlanProposal({ context, intent: intent.intent })
  const validation = validateProposal(proposal, context)

  logAvaPlanDiagnostic({
    type: proposal.type,
    status: proposal.status,
    constraintTypes: (context.constraints ?? []).map((item) => item.type),
    changeTypes: (proposal.changes ?? []).map((item) => item.action),
    validationResult: validation.ok ? 'ok' : validation.reason,
    source: 'deterministic',
  })

  if (!validation.ok) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message:
        validation.message ??
        "I can't safely adjust that part of your plan yet. Your current schedule stays unchanged.",
      readOnly: true,
      raw: validation,
    })
  }

  if (!proposal.requiresConfirmation) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: proposal.message,
      readOnly: true,
      raw: { proposal },
    })
  }

  setActivePlanProposal(session, proposal)

  return createPipelineOutcome({
    kind: AVA_PIPELINE_KIND.PLAN_PROPOSAL,
    message: proposal.message,
    planProposal: proposal,
    actions: [
      {
        id: 'APPLY_PLAN_PROPOSAL',
        label: proposal.proposedPlan?.daily?.sessionExecutionPlan?.maxMinutes
          ? 'Apply focus'
          : 'Apply plan',
      },
      {
        id: 'CANCEL_PLAN_PROPOSAL',
        label: proposal.proposedPlan?.daily?.sessionExecutionPlan?.maxMinutes
          ? 'Keep full session'
          : 'Keep current plan',
      },
    ],
    readOnly: true,
    raw: { proposal },
  })
}

export default runPlanningPipelineStep
