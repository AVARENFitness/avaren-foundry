import { AVA_CONVERSATION_ACTIONS } from './avaConversation'

export const AVA_MODEL_ACTION_TYPES = {
  START_WORKOUT: 'START_WORKOUT',
  CONTINUE_WORKOUT: 'CONTINUE_WORKOUT',
  OPEN_READINESS: 'OPEN_READINESS',
  START_RECOVERY: 'START_RECOVERY',
  OPEN_MOBILITY: 'OPEN_MOBILITY',
  OPEN_NUTRITION: 'OPEN_NUTRITION',
  OPEN_PROGRESS: 'OPEN_PROGRESS',
  OPEN_ASSIGNMENT: 'OPEN_ASSIGNMENT',
  NONE: 'NONE',
}

const ACTION_REGISTRY = {
  [AVA_MODEL_ACTION_TYPES.START_WORKOUT]: {
    id: AVA_CONVERSATION_ACTIONS.START_WORKOUT,
    defaultLabel: 'Start workout',
  },
  [AVA_MODEL_ACTION_TYPES.CONTINUE_WORKOUT]: {
    id: AVA_CONVERSATION_ACTIONS.CONTINUE_WORKOUT,
    defaultLabel: 'Continue workout',
  },
  [AVA_MODEL_ACTION_TYPES.OPEN_READINESS]: {
    id: AVA_CONVERSATION_ACTIONS.OPEN_READINESS,
    defaultLabel: 'Open Readiness',
  },
  [AVA_MODEL_ACTION_TYPES.START_RECOVERY]: {
    id: AVA_CONVERSATION_ACTIONS.START_RECOVERY,
    defaultLabel: 'Start Recovery Flow',
  },
  [AVA_MODEL_ACTION_TYPES.OPEN_MOBILITY]: {
    id: AVA_CONVERSATION_ACTIONS.START_RECOVERY,
    defaultLabel: 'Start Recovery Flow',
  },
  [AVA_MODEL_ACTION_TYPES.OPEN_NUTRITION]: {
    id: AVA_CONVERSATION_ACTIONS.OPEN_NUTRITION,
    defaultLabel: 'Open Nutrition',
  },
  [AVA_MODEL_ACTION_TYPES.OPEN_PROGRESS]: {
    id: AVA_CONVERSATION_ACTIONS.OPEN_PROGRESS,
    defaultLabel: 'View Progress',
  },
  [AVA_MODEL_ACTION_TYPES.OPEN_ASSIGNMENT]: {
    id: AVA_CONVERSATION_ACTIONS.VIEW_ASSIGNMENT,
    defaultLabel: 'View assignment',
  },
  [AVA_MODEL_ACTION_TYPES.NONE]: null,
}

export const isAllowedAvaModelActionType = (type = '') =>
  Object.prototype.hasOwnProperty.call(ACTION_REGISTRY, String(type ?? '').trim())

export const mapModelActionToClientAction = (
  suggestedAction = null,
  packet = {},
) => {
  if (!suggestedAction || typeof suggestedAction !== 'object') return null

  const type = String(suggestedAction.type ?? '').trim()
  if (!isAllowedAvaModelActionType(type) || type === AVA_MODEL_ACTION_TYPES.NONE) {
    return null
  }

  const registry = ACTION_REGISTRY[type]
  if (!registry) return null

  const workoutName =
    packet.workout?.displayName ?? packet.workout?.formattedName ?? null
  const formattedWorkout =
    packet.workout?.formattedName ?? packet.facts?.canonicalWorkoutFormatted

  let label = String(suggestedAction.label ?? registry.defaultLabel).trim()
  if (!label) label = registry.defaultLabel

  const meta = {}

  if (
    (type === AVA_MODEL_ACTION_TYPES.START_WORKOUT ||
      type === AVA_MODEL_ACTION_TYPES.CONTINUE_WORKOUT) &&
    workoutName
  ) {
    meta.workoutName = workoutName
    if (type === AVA_MODEL_ACTION_TYPES.START_WORKOUT && formattedWorkout) {
      label = `Start ${formattedWorkout}`
    }
  }

  return {
    id: registry.id,
    label,
    meta,
  }
}

export const sanitizeModelFollowUpSuggestions = (suggestions = [], limit = 3) =>
  (Array.isArray(suggestions) ? suggestions : [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, limit)
