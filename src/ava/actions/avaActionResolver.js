import { formatWorkoutName } from '../../lib/avaContext'
import { getAvaActionDefinition } from './avaActionRegistry'
import { logReferentDiagnostic } from './avaActionDiagnostics'
import {
  parseReferentVerb,
  REFERENT_ENTITY_TYPES,
  resolveReferentVerbAction,
} from './avaActionReferent'
import {
  AVA_ACTION_IDS,
  AVA_ACTION_SOURCE,
  normalizeAvaActionId,
} from './avaActionTypes'

const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ')

const EXPLICIT_START_WORKOUT = [
  /^start (my )?(workout|today'?s workout)\.?$/,
  /^let'?s (start|do) (the )?workout\.?$/,
  /^start (my )?(chest|back|legs|push|pull|upper|lower|full body|arms)/,
]

const EXPLICIT_OPEN_READINESS = [
  /^(show|open|check) (me )?(my )?readiness\.?$/,
  /^(show|open) (my )?check-?in\.?$/,
  /^open my readiness\.?$/,
  /^(go|take me) to readiness\.?$/,
  /readiness check-?in\.?$/,
]

const EXPLICIT_OPEN_NUTRITION = [
  /^open nutrition\.?$/,
  /^go to nutrition\.?$/,
  /^take me to nutrition\.?$/,
  /^show (me )?(my )?nutrition\.?$/,
]

const EXPLICIT_OPEN_RECOVERY = [
  /^(open|show|go to|take me to) recovery\.?$/,
]

const EXPLICIT_START_RECOVERY = [
  /^start (the )?recovery( flow)?\.?$/,
  /^give me (the )?recovery( option| flow)?\.?$/,
]

const REFERENT_PATTERNS = [
  /^start (it|that)\.?$/,
  /^let'?s do (it|that)\.?$/,
  /^open (it|that)\.?$/,
  /^take me there\.?$/,
  /^do that\.?$/,
]

const resolveWorkoutName = (session = null, packet = null) =>
  formatWorkoutName(
    session?.topic?.workoutName ??
      session?.activeReferent?.entityId ??
      packet?.workout?.displayName ??
      packet?.facts?.canonicalWorkout,
  )

export const workoutContextAvailable = (packet = null) => {
  if (packet?.workout?.isRestDay && !packet?.workout?.coachAssigned) {
    return false
  }

  return Boolean(
    packet?.workout?.displayName ||
      packet?.facts?.canonicalWorkout ||
      packet?.workout?.isActive,
  )
}

export const buildActionResolution = ({
  actionId,
  source = AVA_ACTION_SOURCE.DETERMINISTIC,
  executeImmediately = false,
  label = null,
  meta = {},
  reason = null,
} = {}) => {
  const normalizedId = normalizeAvaActionId(actionId)
  if (!normalizedId || !getAvaActionDefinition(normalizedId)) {
    return null
  }

  return {
    actionId: normalizedId,
    source,
    executeImmediately,
    label,
    meta,
    reason,
  }
}

export const resolveExplicitAction = (message = '', { session, packet } = {}) => {
  const text = normalize(message)
  if (!text) return null

  if (EXPLICIT_START_WORKOUT.some((pattern) => pattern.test(text))) {
    if (!workoutContextAvailable(packet)) {
      return buildActionResolution({
        actionId: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
        source: AVA_ACTION_SOURCE.DETERMINISTIC,
        executeImmediately: false,
        reason: 'no-workout',
      })
    }

    const workoutName = resolveWorkoutName(session, packet)
    return buildActionResolution({
      actionId: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
      source: AVA_ACTION_SOURCE.DETERMINISTIC,
      executeImmediately: true,
      label: workoutName ? `Start ${workoutName}` : 'Start workout',
      meta: { workoutName },
    })
  }

  if (EXPLICIT_OPEN_READINESS.some((pattern) => pattern.test(text))) {
    return buildActionResolution({
      actionId: AVA_ACTION_IDS.OPEN_READINESS,
      source: AVA_ACTION_SOURCE.DETERMINISTIC,
      executeImmediately: true,
      label: 'Open Readiness',
    })
  }

  if (EXPLICIT_OPEN_NUTRITION.some((pattern) => pattern.test(text))) {
    return buildActionResolution({
      actionId: AVA_ACTION_IDS.OPEN_NUTRITION,
      source: AVA_ACTION_SOURCE.DETERMINISTIC,
      executeImmediately: true,
      label: 'Open Nutrition',
    })
  }

  if (EXPLICIT_OPEN_RECOVERY.some((pattern) => pattern.test(text))) {
    return buildActionResolution({
      actionId: AVA_ACTION_IDS.OPEN_RECOVERY,
      source: AVA_ACTION_SOURCE.DETERMINISTIC,
      executeImmediately: true,
      label: 'Open Recovery',
    })
  }

  if (EXPLICIT_START_RECOVERY.some((pattern) => pattern.test(text))) {
    return buildActionResolution({
      actionId: AVA_ACTION_IDS.START_RECOVERY_FLOW,
      source: AVA_ACTION_SOURCE.DETERMINISTIC,
      executeImmediately: true,
      label: 'Start Recovery Flow',
    })
  }

  return null
}

export const resolveReferentAction = (message = '', { session, packet } = {}) => {
  const text = normalize(message)
  if (!text || !REFERENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return null
  }

  const verb = parseReferentVerb(text)
  const referent = session?.activeReferent ?? null

  if (!referent?.entityType) {
    logReferentDiagnostic({
      verb,
      resolvedType: null,
      resolvedActionId: null,
      confidence: 'none',
      ambiguous: true,
    })
    return {
      actionId: null,
      source: AVA_ACTION_SOURCE.REFERENT,
      executeImmediately: false,
      ambiguous: true,
      message: 'What should I start — your workout or recovery?',
    }
  }

  const actionId = resolveReferentVerbAction(verb, referent)

  if (!actionId) {
    logReferentDiagnostic({
      verb,
      resolvedType: referent.entityType,
      resolvedActionId: null,
      confidence: 'incompatible-verb',
      ambiguous: true,
    })
    return {
      actionId: null,
      source: AVA_ACTION_SOURCE.REFERENT,
      executeImmediately: false,
      ambiguous: true,
      message:
        referent.entityType === REFERENT_ENTITY_TYPES.READINESS ||
        referent.entityType === REFERENT_ENTITY_TYPES.NUTRITION
          ? `Did you want me to open ${referent.entityType}?`
          : 'What should I start — your workout or recovery?',
    }
  }

  if (
    actionId === AVA_ACTION_IDS.START_TODAYS_WORKOUT &&
    !workoutContextAvailable(packet)
  ) {
    return buildActionResolution({
      actionId,
      source: AVA_ACTION_SOURCE.REFERENT,
      executeImmediately: false,
      reason: 'no-workout',
    })
  }

  const workoutName = resolveWorkoutName(session, packet)

  logReferentDiagnostic({
    verb,
    resolvedType: referent.entityType,
    resolvedActionId: actionId,
    confidence: 'high',
    ambiguous: false,
  })

  return buildActionResolution({
    actionId,
    source: AVA_ACTION_SOURCE.REFERENT,
    executeImmediately: true,
    label:
      referent.label ??
      (workoutName && actionId === AVA_ACTION_IDS.START_TODAYS_WORKOUT
        ? `Start ${workoutName}`
        : null),
    meta: {
      workoutName,
      referentType: referent.entityType,
    },
  })
}

export const resolveDeterministicAction = (message = '', context = {}) =>
  resolveExplicitAction(message, context) ??
  resolveReferentAction(message, context)

export const resolveActionFromMessage = (message = '', context = {}) =>
  resolveDeterministicAction(message, context)

export const resolveModelProposedAction = (
  suggestedAction = null,
  { packet, role = 'athlete' } = {},
) => {
  if (!suggestedAction) return null

  const rawId =
    suggestedAction.id ??
    suggestedAction.actionId ??
    suggestedAction.type ??
    null
  const actionId = normalizeAvaActionId(rawId)
  const definition = getAvaActionDefinition(actionId)

  if (!actionId || !definition) {
    return {
      rejected: true,
      rawId,
      message: "I can't run that action safely right now.",
    }
  }

  if (!definition.allowedRoles.includes(role)) {
    return {
      rejected: true,
      rawId,
      message: "That action isn't available here.",
    }
  }

  if (
    definition.requiredContext.includes('workoutAvailable') &&
    !workoutContextAvailable(packet)
  ) {
    return {
      rejected: true,
      rawId: actionId,
      message: definition.buildFailureMessage({ reason: 'no-workout' }),
    }
  }

  const workoutName = resolveWorkoutName(null, packet)
  let label = String(suggestedAction.label ?? '').trim()
  if (!label) {
    label =
      actionId === AVA_ACTION_IDS.START_TODAYS_WORKOUT && workoutName
        ? `Start ${workoutName}`
        : definition.description
  }

  return buildActionResolution({
    actionId,
    source: AVA_ACTION_SOURCE.MODEL,
    executeImmediately: false,
    label,
    meta: {
      workoutName,
      modelType: rawId,
    },
  })
}

export const actionResolutionToChip = (resolution = null) => {
  if (!resolution?.actionId) return null

  return {
    id: resolution.actionId,
    actionId: resolution.actionId,
    label: resolution.label ?? resolution.actionId,
    meta: resolution.meta ?? {},
  }
}

export const isExplicitNavigationCommand = (message = '') =>
  Boolean(resolveExplicitAction(message))

export const isReferentCommand = (message = '') => {
  const text = normalize(message)
  return REFERENT_PATTERNS.some((pattern) => pattern.test(text))
}
