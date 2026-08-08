import { AVA_ACTION_IDS } from './avaActionTypes'
import { logReferentDiagnostic } from './avaActionDiagnostics'

export const REFERENT_ENTITY_TYPES = {
  WORKOUT: 'workout',
  RECOVERY: 'recovery',
  READINESS: 'readiness',
  NUTRITION: 'nutrition',
}

export const REFERENT_VERBS = {
  START: 'start',
  OPEN: 'open',
  DO: 'do',
}

const STARTABLE_ACTIONS = {
  [REFERENT_ENTITY_TYPES.WORKOUT]: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
  [REFERENT_ENTITY_TYPES.RECOVERY]: AVA_ACTION_IDS.START_RECOVERY_FLOW,
}

const OPENABLE_ACTIONS = {
  [REFERENT_ENTITY_TYPES.WORKOUT]: AVA_ACTION_IDS.OPEN_WORKOUT,
  [REFERENT_ENTITY_TYPES.RECOVERY]: AVA_ACTION_IDS.OPEN_RECOVERY,
  [REFERENT_ENTITY_TYPES.READINESS]: AVA_ACTION_IDS.OPEN_READINESS,
  [REFERENT_ENTITY_TYPES.NUTRITION]: AVA_ACTION_IDS.OPEN_NUTRITION,
}

export const createActiveReferent = ({
  entityType,
  actionId = null,
  label = null,
  entityId = null,
  sourceMessageId = null,
  ephemeral = false,
} = {}) => ({
  entityType,
  actionId,
  label,
  entityId,
  sourceMessageId,
  ephemeral: Boolean(ephemeral),
  createdAt: new Date().toISOString(),
})

export const setSessionActiveReferent = (session, referent) => {
  if (!session) return null

  if (!referent?.entityType) {
    session.activeReferent = null
    return null
  }

  session.activeReferent = createActiveReferent(referent)
  return session.activeReferent
}

export const clearSessionActiveReferent = (session) => {
  if (!session) return
  session.activeReferent = null
}

export const invalidateSessionReferent = (session, { entityType, reason = 'superseded' } = {}) => {
  if (!session?.activeReferent) return

  if (!entityType || session.activeReferent.entityType === entityType) {
    logReferentDiagnostic({
      verb: null,
      resolvedType: session.activeReferent.entityType,
      resolvedActionId: session.activeReferent.actionId,
      confidence: 'cleared',
      ambiguous: false,
      reason,
    })
    session.activeReferent = null
  }
}

export const referentFromWorkoutContext = ({
  workoutName,
  sourceMessageId = null,
  ephemeral = false,
} = {}) =>
  createActiveReferent({
    entityType: REFERENT_ENTITY_TYPES.WORKOUT,
    actionId: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
    label: workoutName ? `Start ${workoutName}` : 'Start workout',
    entityId: workoutName ?? null,
    sourceMessageId,
    ephemeral,
  })

export const referentFromRecoveryContext = ({
  sourceMessageId = null,
  ephemeral = false,
} = {}) =>
  createActiveReferent({
    entityType: REFERENT_ENTITY_TYPES.RECOVERY,
    actionId: AVA_ACTION_IDS.START_RECOVERY_FLOW,
    label: 'Start Recovery Flow',
    sourceMessageId,
    ephemeral,
  })

export const referentFromModelAction = ({
  actionId,
  label = null,
  sourceMessageId = null,
} = {}) => {
  const entityType = actionIdToEntityType(actionId)
  if (!entityType) return null

  return createActiveReferent({
    entityType,
    actionId,
    label,
    sourceMessageId,
    ephemeral: true,
  })
}

const actionIdToEntityType = (actionId) => {
  switch (actionId) {
    case AVA_ACTION_IDS.START_TODAYS_WORKOUT:
    case AVA_ACTION_IDS.OPEN_WORKOUT:
      return REFERENT_ENTITY_TYPES.WORKOUT
    case AVA_ACTION_IDS.START_RECOVERY_FLOW:
    case AVA_ACTION_IDS.OPEN_RECOVERY:
      return REFERENT_ENTITY_TYPES.RECOVERY
    case AVA_ACTION_IDS.OPEN_READINESS:
      return REFERENT_ENTITY_TYPES.READINESS
    case AVA_ACTION_IDS.OPEN_NUTRITION:
      return REFERENT_ENTITY_TYPES.NUTRITION
    default:
      return null
  }
}

export const parseReferentVerb = (message = '') => {
  const text = String(message).trim().toLowerCase()

  if (/^start (it|that)\.?/.test(text) || /^let'?s do (it|that)\.?/.test(text)) {
    return REFERENT_VERBS.START
  }

  if (/^open (it|that)\.?/.test(text) || /^take me there\.?/.test(text)) {
    return REFERENT_VERBS.OPEN
  }

  return null
}

export const resolveReferentVerbAction = (verb, referent) => {
  if (!verb || !referent?.entityType) return null

  if (verb === REFERENT_VERBS.START) {
    return STARTABLE_ACTIONS[referent.entityType] ?? null
  }

  if (verb === REFERENT_VERBS.OPEN || verb === REFERENT_VERBS.DO) {
    return OPENABLE_ACTIONS[referent.entityType] ?? null
  }

  return null
}

export const updateReferentFromConversation = ({
  session,
  packet,
  message = '',
  avaMessage = '',
  proposedActionId = null,
  sourceMessageId = null,
} = {}) => {
  if (!session) return

  const text = String(message ?? '').toLowerCase()
  const avaText = String(avaMessage ?? '').toLowerCase()

  if (proposedActionId) {
    const referent = referentFromModelAction({
      actionId: proposedActionId,
      sourceMessageId,
    })
    if (referent) {
      setSessionActiveReferent(session, referent)
    }
    return
  }

  if (
    /what workout|workout do i have|today'?s workout|which workout/.test(text) ||
    /\bchest\b|\bback\b|\blegs\b|workout is up|is up today/.test(avaText)
  ) {
    const workoutName =
      packet?.workout?.formattedName ??
      packet?.facts?.canonicalWorkoutFormatted ??
      packet?.workout?.displayName ??
      null

    if (workoutName) {
      invalidateSessionReferent(session, { entityType: REFERENT_ENTITY_TYPES.RECOVERY })
      setSessionActiveReferent(
        session,
        referentFromWorkoutContext({ workoutName, sourceMessageId }),
      )
    }
    return
  }

  if (/recovery|mobility|reset flow|daily reset/.test(avaText) && !/workout|chest|back|legs/.test(avaText)) {
    setSessionActiveReferent(session, referentFromRecoveryContext({ sourceMessageId }))
  }
}

export const getDestinationForAction = (actionId) => {
  switch (actionId) {
    case AVA_ACTION_IDS.START_TODAYS_WORKOUT:
    case AVA_ACTION_IDS.OPEN_WORKOUT:
      return 'gym'
    case AVA_ACTION_IDS.OPEN_READINESS:
      return 'readiness'
    case AVA_ACTION_IDS.OPEN_NUTRITION:
      return 'nutrition'
    case AVA_ACTION_IDS.OPEN_RECOVERY:
    case AVA_ACTION_IDS.START_RECOVERY_FLOW:
      return 'mobility'
    default:
      return null
  }
}

export const isNavigationAction = (actionId) => Boolean(getDestinationForAction(actionId))
