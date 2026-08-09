import {
  ADJUSTMENT_POLICY,
  coachProgramProtectedCopy,
  classifyAdjustmentAction,
} from '../../lib/planOwnership'

const normalize = (value = '') =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export const COACH_PROGRAM_MUTATION_PATTERNS = [
  /\b(take|remove|drop|skip|cut)\s+(out\s+)?(the\s+)?([a-z][a-z\s'-]{1,40})\b/,
  /\b(remove|delete)\s+([a-z][a-z\s'-]{1,40})\s+(from|out of)\b/,
  /\b(change|reduce|lower)\s+(the\s+)?sets?\b/,
  /\b(change|reduce|lower)\s+(the\s+)?reps?\b/,
  /\b(replace|swap)\s+([a-z][a-z\s'-]{1,40})\b/,
]

export const PAIN_EXECUTION_PATTERNS = [
  /\b(hurt|hurts|hurting|pain|painful|sore|ache|aching)\b/,
  /\b(feel(s|ing)? off|doesn't feel right|feels wrong)\b/,
]

export const isCoachProgramMutationRequest = (message = '') => {
  const text = normalize(message)
  if (!text) return false
  return COACH_PROGRAM_MUTATION_PATTERNS.some((pattern) => pattern.test(text))
}

export const isPainExecutionRequest = (message = '', exercises = []) => {
  const text = normalize(message)
  if (!text) return false
  if (!PAIN_EXECUTION_PATTERNS.some((pattern) => pattern.test(text))) return false

  if (extractMentionedExercise(message, exercises)) return true
  if (/\b(shoulder|knee|back|hip|elbow|wrist|ankle|neck|hamstring|quad)\b/.test(text)) {
    return true
  }

  return false
}

export const extractMentionedExercise = (message = '', exercises = []) => {
  const text = normalize(message)
  const names = (exercises ?? [])
    .map((item) => String(item?.name ?? '').trim())
    .filter(Boolean)

  for (const name of names) {
    const lower = name.toLowerCase()
    if (text.includes(lower)) return name

    const tokens = lower.split(/\s+/).filter((token) => token.length > 3)
    for (const token of tokens) {
      if (text.includes(token)) return name
    }
  }

  const match = text.match(
    /\b(take|remove|drop|skip|cut)\s+(out\s+)?(the\s+)?([a-z][a-z\s'-]{1,40})\b/,
  )
  return match?.[4] ? match[4].trim() : null
}

export const buildCoachRequiredResponse = ({
  exerciseName = null,
  ownership = {},
} = {}) => {
  const target = exerciseName ? `${exerciseName}` : 'that movement'

  if (ownership.inPersonCoached) {
    return {
      kind: 'coach_required',
      message: `${target} is part of your coach's programmed session. Your coach can adjust that during the session.`,
      readOnly: true,
    }
  }

  return {
    kind: 'coach_required',
    message: ownership.coachAssigned
      ? `${target} is part of your coach's programmed session. I can help you work around it, but I can't change your coach's prescription. ${coachProgramProtectedCopy}`
      : `That would change your programmed session structure. I can suggest a safer execution adjustment instead.`,
    readOnly: true,
  }
}

export const buildPainExecutionResponse = ({
  exerciseName = null,
  ownership = {},
} = {}) => {
  const target = exerciseName ? `${exerciseName}` : 'that movement'

  if (ownership.inPersonCoached) {
    return {
      kind: 'pain_guidance',
      message: `Stop ${target} if pain is sharp — don't force it. Your coach can adjust the session in person.`,
      readOnly: true,
      offerFollowUp: true,
    }
  }

  return {
    kind: 'pain_guidance',
    message: ownership.coachAssigned
      ? `If ${target} is bothering you, stop if pain is sharp and avoid forcing it today. ${coachProgramProtectedCopy} Tell your coach so they can adjust the plan if needed.`
      : `If ${target} is bothering you, stop if pain is sharp and avoid forcing it today. I can help you trim the session around it without rewriting your workout.`,
    readOnly: true,
    offerFollowUp: Boolean(ownership.coachAssigned || ownership.hasCoachRelationship),
  }
}

export const buildCoachLockedScheduleResponse = ({
  dayName = 'that day',
} = {}) => ({
  kind: 'coach_locked_schedule',
  message: `That session is coach-scheduled for ${dayName}. I can suggest another day, but your coach would need to confirm the move.`,
  readOnly: true,
})

export const canApplyAdjustment = (action = '', ownership = {}) => {
  const policy = classifyAdjustmentAction(action)

  if (policy === ADJUSTMENT_POLICY.ATHLETE_SAFE) return { ok: true }

  if (policy === ADJUSTMENT_POLICY.CONDITIONAL) {
    if (ownership.scheduleControlledByCoach) {
      return {
        ok: false,
        reason: 'coach_locked_schedule',
      }
    }
    return { ok: true }
  }

  return {
    ok: false,
    reason: 'coach_required',
  }
}
