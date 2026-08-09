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
  [AVA_ACTION_IDS.OPEN_COACH_HUB]: {
    id: AVA_ACTION_IDS.OPEN_COACH_HUB,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Open Coach Hub.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: () => 'Opening Coach Hub.',
    buildFailureMessage: () => "I couldn't open Coach Hub. Try again.",
  },
  [AVA_ACTION_IDS.OPEN_CLIENT_PROFILE]: {
    id: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Open an authorized client profile.',
    requiredContext: ['authorizedClient'],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: (context = {}) =>
      context.clientName
        ? `Opening ${context.clientName}.`
        : 'Opening client profile.',
    buildFailureMessage: (context = {}) =>
      context.reason === 'unauthorized-client'
        ? "That client isn't in your authorized roster."
        : "I couldn't open that client profile. Try again.",
  },
  [AVA_ACTION_IDS.OPEN_CLIENT_INTELLIGENCE]: {
    id: AVA_ACTION_IDS.OPEN_CLIENT_INTELLIGENCE,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Open client intelligence for an authorized client.',
    requiredContext: ['authorizedClient'],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: (context = {}) =>
      context.clientName
        ? `Opening ${context.clientName}'s intelligence.`
        : 'Opening client intelligence.',
    buildFailureMessage: (context = {}) =>
      context.reason === 'unauthorized-client'
        ? "That client isn't in your authorized roster."
        : "I couldn't open client intelligence. Try again.",
  },
  [AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS]: {
    id: AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Open weekly reviews.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: (context = {}) =>
      context.clientName
        ? `Opening ${context.clientName}'s weekly review.`
        : 'Opening weekly reviews.',
    buildFailureMessage: () => "I couldn't open weekly reviews. Try again.",
  },
  [AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION]: {
    id: AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Show clients needing attention.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: () => 'Here are the clients that stand out.',
    buildFailureMessage: () => "I couldn't load attention signals right now.",
  },
  [AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN]: {
    id: AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Show clients missing weekly check-ins.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: () => 'Here are clients missing check-ins.',
    buildFailureMessage: () => "I couldn't load check-in status right now.",
  },
  [AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS]: {
    id: AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Show recovery concerns.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: () => 'Here are recovery concerns from recent check-ins.',
    buildFailureMessage: () => "I couldn't load recovery signals right now.",
  },
  [AVA_ACTION_IDS.SHOW_TRAINING_CONCERNS]: {
    id: AVA_ACTION_IDS.SHOW_TRAINING_CONCERNS,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Show training concerns.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: () => 'Here are training concerns from recent activity.',
    buildFailureMessage: () => "I couldn't load training signals right now.",
  },
  [AVA_ACTION_IDS.SHOW_NUTRITION_CONCERNS]: {
    id: AVA_ACTION_IDS.SHOW_NUTRITION_CONCERNS,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Show nutrition concerns.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: () => 'Here are nutrition logging concerns.',
    buildFailureMessage: () => "I couldn't load nutrition signals right now.",
  },
  [AVA_ACTION_IDS.SHOW_CLIENT_FOLLOWUPS]: {
    id: AVA_ACTION_IDS.SHOW_CLIENT_FOLLOWUPS,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Show open athlete follow-ups.',
    requiredContext: [],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: () => 'Here are open client follow-ups.',
    buildFailureMessage: () => "I couldn't load client follow-ups right now.",
  },
  [AVA_ACTION_IDS.CLIENT_SUMMARY]: {
    id: AVA_ACTION_IDS.CLIENT_SUMMARY,
    domain: AVA_ACTION_DOMAINS.COACH,
    description: 'Summarize an authorized client from trusted intelligence.',
    requiredContext: ['authorizedClient'],
    confirmationPolicy: AVA_ACTION_CONFIRMATION.NONE,
    reversible: false,
    allowedRoles: ['coach'],
    buildSuccessMessage: () => 'Here is a quick client update.',
    buildFailureMessage: () => "I couldn't build that client summary.",
  },
}

export const isRegisteredAvaAction = (actionId = '') =>
  Boolean(AVA_ACTION_REGISTRY[String(actionId ?? '').trim()])

export const getAvaActionDefinition = (actionId = '') =>
  AVA_ACTION_REGISTRY[String(actionId ?? '').trim()] ?? null

export const listRegisteredAvaActionIds = () => Object.keys(AVA_ACTION_REGISTRY)
