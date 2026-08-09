import {
  AVA_PIPELINE_KIND,
  createPipelineOutcome,
} from '../avaPipelineOutcome'
import {
  buildFollowUpSummary,
  FOLLOWUP_REASON_TYPE,
  FOLLOWUP_SOURCE_TYPE,
  inferFollowUpReason,
} from '../../lib/coachFollowUp'
import {
  SESSION_MODE,
  sessionModeLabel,
} from '../../lib/sessionMode'
import {
  buildPainExecutionResponse,
  extractMentionedExercise,
  isCoachProgramMutationRequest,
  isPainExecutionRequest,
  PAIN_EXECUTION_PATTERNS,
} from '../planning/avaPlanPolicy'
import { buildCoachRequiredResponse } from '../planning/avaPlanPolicy'
import {
  clearPendingCoachFollowUp,
  getPendingCoachFollowUp,
  markCoachFollowUpSubmitted,
  setPendingCoachFollowUp,
  wasCoachFollowUpSubmitted,
} from './avaCoachFollowUpSession'
import { hasActivePendingTransaction, isAwaitingConfirmation } from '../avaTransactionState'

const normalize = (value = '') =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const COACH_HANDOFF_PATTERNS = [
  /\b(let my coach know|tell my coach|flag for coach|notify my coach)\b/,
  /\b(can you (let|tell) my coach)\b/,
  /\b(i need to tell my coach)\b/,
  /\b(message my coach)\b/,
]

const SCHEDULE_CONFLICT_PATTERNS = [
  /\b(can't make|cannot make|won't make|unable to make)\b/,
  /\b(schedule conflict|reschedule|move my session)\b/,
  /\b(miss(?:ed|ing)? (?:this )?(?:session|workout|training))\b/,
]

const SESSION_CONTEXT_PATTERNS = [
  /\b(is this with my coach)\b/,
  /\b(am i training with my coach)\b/,
  /\b(coach session today)\b/,
  /\b(in[- ]person session)\b/,
]

const TODAY_PLAN_PATTERNS = [
  /\b(what am i doing today)\b/,
  /\b(what's my workout today)\b/,
  /\b(what is today'?s (?:workout|session|plan))\b/,
]

export const isCoachHandoffRequest = (message = '') =>
  COACH_HANDOFF_PATTERNS.some((pattern) => pattern.test(normalize(message)))

export const isScheduleConflictRequest = (message = '') =>
  SCHEDULE_CONFLICT_PATTERNS.some((pattern) => pattern.test(normalize(message)))

export const isSessionContextQuery = (message = '') =>
  SESSION_CONTEXT_PATTERNS.some((pattern) => pattern.test(normalize(message)))

export const isTodayPlanQuery = (message = '') =>
  TODAY_PLAN_PATTERNS.some((pattern) => pattern.test(normalize(message)))

const buildFollowUpProposal = ({
  reasonType = FOLLOWUP_REASON_TYPE.ATHLETE_QUESTION,
  summary = '',
  exerciseName = null,
  sessionId = null,
  assignmentId = null,
} = {}) => ({
  id: crypto.randomUUID(),
  reasonType,
  summary,
  exerciseName,
  sessionId,
  assignmentId,
  sourceType: FOLLOWUP_SOURCE_TYPE.AVA_ATHLETE,
})

export async function runCoachFollowUpPipelineStep({
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

  const text = normalize(message)
  if (!text) return null

  const pending = getPendingCoachFollowUp(session)

  if (/\b(cancel|never mind|nevermind)\b/.test(text) && pending) {
    clearPendingCoachFollowUp(session)
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.CANCELLED,
      message: 'Follow-up cancelled.',
      readOnly: true,
    })
  }

  if (
    pending &&
    (/\b(send to coach|send it|yes,? send|confirm)\b/.test(text) ||
      text === 'send')
  ) {
    if (wasCoachFollowUpSubmitted(session, pending.id)) {
      clearPendingCoachFollowUp(session)
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_SUCCESS,
        message: 'Already sent to your coach.',
        readOnly: true,
      })
    }

    const submit = actionRuntime?.submitCoachFollowUp
    if (typeof submit !== 'function') {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
        message: 'Coach follow-up is not available right now.',
        readOnly: true,
      })
    }

    try {
      const saved = await submit(pending)
      markCoachFollowUpSubmitted(session, pending.id)
      clearPendingCoachFollowUp(session)
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_SUCCESS,
        message: 'Sent to your coach. They will see this as a follow-up item.',
        readOnly: true,
        raw: { followUp: saved },
      })
    } catch {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
        message: 'Could not send that follow-up. Try again in a moment.',
        readOnly: true,
      })
    }
  }

  const ownership = packet?.planningOwnership ?? {}
  const hasCoach = Boolean(ownership.hasCoachRelationship ?? packet?.hasCoachRelationship)
  const activeWorkout = packet?.activeWorkout ?? null
  const sessionMode =
    activeWorkout?.sessionMode ??
    (ownership.coachAssigned ? SESSION_MODE.COACH_ASSIGNED : SESSION_MODE.SOLO)
  const exercises =
    activeWorkout?.exercises ??
    packet?.todayWorkoutExercises ??
    []

  if (isSessionContextQuery(message)) {
    const label = sessionModeLabel(sessionMode)
    const workoutName = packet?.todayWorkout?.displayName ?? packet?.todayWorkout?.name
    const copy = label
      ? `Yes — ${label}${workoutName ? `: ${workoutName}` : ''}.`
      : workoutName
        ? `Today's session is ${workoutName}. This is your own training plan.`
        : 'This looks like a solo session on your plan today.'

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: copy,
      readOnly: true,
    })
  }

  if (isTodayPlanQuery(message)) {
    const workoutName =
      packet?.todayWorkout?.displayName ??
      packet?.todayWorkout?.name ??
      'Open schedule'
    const label = sessionModeLabel(sessionMode)
    const focus = packet?.executionFocusLabel
    const parts = [
      `Today: ${workoutName}.`,
      label ? label : null,
      focus ? `${focus} active` : null,
    ].filter(Boolean)

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: parts.join(' '),
      readOnly: true,
    })
  }

  if (
    isCoachProgramMutationRequest(message) &&
    ownership.coachAssigned
  ) {
    const response = buildCoachRequiredResponse({
      exerciseName: extractMentionedExercise(message, exercises),
      ownership: {
        ...ownership,
        inPersonCoached: sessionMode === SESSION_MODE.IN_PERSON_COACHED,
      },
    })
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: response.message,
      readOnly: true,
    })
  }

  const isPain =
    isPainExecutionRequest(message, exercises) ||
    PAIN_EXECUTION_PATTERNS.some((pattern) => pattern.test(text))
  const isSchedule = isScheduleConflictRequest(message)
  const isHandoff = isCoachHandoffRequest(message)
  const isProgramChange =
    isCoachProgramMutationRequest(message) && !ownership.coachAssigned

  if (!hasCoach && (isHandoff || isSchedule)) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message:
        'You do not have a coach linked in AVAREN yet. Connect with your coach in Account to send follow-ups.',
      readOnly: true,
    })
  }

  if (isPain && exercises.length) {
    const exerciseName = extractMentionedExercise(message, exercises)
    const response = buildPainExecutionResponse({
      exerciseName,
      ownership: {
        ...ownership,
        hasCoachRelationship: hasCoach,
        inPersonCoached: sessionMode === SESSION_MODE.IN_PERSON_COACHED,
      },
    })

    if (!hasCoach || !response.offerFollowUp) {
      return null
    }

    const summary = buildFollowUpSummary({
      reasonType: FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT,
      exerciseName,
      detail: message,
    })

    const proposal = buildFollowUpProposal({
      reasonType: FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT,
      summary,
      exerciseName,
      sessionId: activeWorkout?.id ?? null,
      assignmentId: activeWorkout?.assignmentId ?? null,
    })

    setPendingCoachFollowUp(session, proposal)

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.FOLLOW_UP_PROPOSAL,
      message: `${response.message} I can flag it for your coach.`,
      followUpProposal: proposal,
      readOnly: true,
    })
  }

  if (isSchedule || isHandoff || isProgramChange) {
    const reasonType = inferFollowUpReason({
      message,
      isSchedule,
      isProgramChange,
    })

    const summary = buildFollowUpSummary({
      reasonType,
      detail: message,
      workoutName: packet?.todayWorkout?.displayName ?? null,
    })

    const proposal = buildFollowUpProposal({
      reasonType,
      summary,
      sessionId: activeWorkout?.id ?? null,
      assignmentId: activeWorkout?.assignmentId ?? null,
    })

    setPendingCoachFollowUp(session, proposal)

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.FOLLOW_UP_PROPOSAL,
      message: 'I can send a concise follow-up to your coach — no chat transcript, just the summary.',
      followUpProposal: proposal,
      readOnly: true,
    })
  }

  return null
}

export default runCoachFollowUpPipelineStep
