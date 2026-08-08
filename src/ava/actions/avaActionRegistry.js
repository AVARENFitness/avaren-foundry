import {
  AVA_ACTION_CONFIRMATION,
  AVA_ACTION_DOMAINS,
  AVA_ACTION_IDS,
} from './avaActionTypes'

/**
 * Canonical AVA action registry — metadata only.
 * Execution lives in avaActionExecutor with injected runtime.
 */
export const AVA_ACTION_REGISTRY = {
  [AVA_ACTION_IDS.START_TODAYS_WORKOUT]: {
    id: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
    domain: AVA_ACTION_DOMAINS.WORKOUT,
    description: 'Start or continue the trusted workout for today.',
    requiredContext: ['workoutAvailable'],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['athlete', 'coach'],
    buildSuccessMessage: (context = {}) => {
      const name =
        context.workoutName ??
        context.packet?.workout?.formattedName ??
        context.packet?.facts?.canonicalWorkoutFormatted ??
        'your workout'
      return context.alreadyActive
        ? `${name} is open.`
        : `Opening ${name}.`
    },
    buildFailureMessage: (context = {}) =>
      context.reason === 'no-workout'
        ? "I couldn't find a workout to start today."
        : "I couldn't open the workout. Try again.",
  },
  [AVA_ACTION_IDS.OPEN_WORKOUT]: {
    id: AVA_ACTION_IDS.OPEN_WORKOUT,
    domain: AVA_ACTION_DOMAINS.WORKOUT,
    description: 'Open the workout screen.',
    requiredContext: ['workoutAvailable'],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['athlete', 'coach'],
    buildSuccessMessage: (context = {}) => {
      const name =
        context.workoutName ??
        context.packet?.workout?.formattedName ??
        'your workout'
      return `Opening ${name}.`
    },
    buildFailureMessage: () => "I couldn't open the workout screen. Try again.",
  },
  [AVA_ACTION_IDS.OPEN_READINESS]: {
    id: AVA_ACTION_IDS.OPEN_READINESS,
    domain: AVA_ACTION_DOMAINS.READINESS,
    description: 'Open readiness check-in.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['athlete', 'coach'],
    buildSuccessMessage: () => 'Opening readiness.',
    buildFailureMessage: () => "I couldn't open readiness. Try again.",
  },
  [AVA_ACTION_IDS.OPEN_RECOVERY]: {
    id: AVA_ACTION_IDS.OPEN_RECOVERY,
    domain: AVA_ACTION_DOMAINS.RECOVERY,
    description: 'Open recovery options.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['athlete', 'coach'],
    buildSuccessMessage: () => 'Opening recovery.',
    buildFailureMessage: () => "I couldn't open recovery. Try again.",
  },
  [AVA_ACTION_IDS.OPEN_NUTRITION]: {
    id: AVA_ACTION_IDS.OPEN_NUTRITION,
    domain: AVA_ACTION_DOMAINS.NUTRITION,
    description: 'Open nutrition logging.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['athlete', 'coach'],
    buildSuccessMessage: () => 'Opening nutrition.',
    buildFailureMessage: () => "I couldn't open nutrition. Try again.",
  },
  [AVA_ACTION_IDS.START_RECOVERY_FLOW]: {
    id: AVA_ACTION_IDS.START_RECOVERY_FLOW,
    domain: AVA_ACTION_DOMAINS.RECOVERY,
    description: 'Start the canonical recovery flow.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['athlete', 'coach'],
    buildSuccessMessage: () => 'Starting recovery flow.',
    buildFailureMessage: () => "I couldn't start recovery. Try again.",
  },
}

export const isRegisteredAvaAction = (actionId = '') =>
  Boolean(AVA_ACTION_REGISTRY[String(actionId ?? '').trim()])

export const getAvaActionDefinition = (actionId = '') =>
  AVA_ACTION_REGISTRY[String(actionId ?? '').trim()] ?? null

export const listRegisteredAvaActionIds = () => Object.keys(AVA_ACTION_REGISTRY)
