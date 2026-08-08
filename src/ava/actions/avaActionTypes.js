export const AVA_ACTION_IDS = {
  START_TODAYS_WORKOUT: 'START_TODAYS_WORKOUT',
  OPEN_WORKOUT: 'OPEN_WORKOUT',
  OPEN_READINESS: 'OPEN_READINESS',
  OPEN_RECOVERY: 'OPEN_RECOVERY',
  OPEN_NUTRITION: 'OPEN_NUTRITION',
  START_RECOVERY_FLOW: 'START_RECOVERY_FLOW',
}

export const AVA_ACTION_DOMAINS = {
  WORKOUT: 'workout',
  READINESS: 'readiness',
  RECOVERY: 'recovery',
  NUTRITION: 'nutrition',
}

export const AVA_ACTION_CONFIRMATION = {
  NONE: 'none',
  REQUIRED: 'required',
}

export const AVA_ACTION_SOURCE = {
  DETERMINISTIC: 'deterministic',
  MODEL: 'model',
  UI: 'ui',
  REFERENT: 'referent',
}

export const AVA_ACTION_STAGE = {
  RESOLVED: 'resolved',
  CONFIRMATION: 'confirmation',
  EXECUTING: 'executing',
  VERIFIED: 'verified',
  FAILED: 'failed',
}

export const AVA_ACTION_OUTCOME_KIND = {
  ACTION_READY: 'action_ready',
  ACTION_CONFIRMATION: 'action_confirmation',
  ACTION_SUCCESS: 'action_success',
  ACTION_FAILURE: 'action_failure',
  ACTION_CANCELLED: 'action_cancelled',
}

/** Maps legacy model / conversation kebab IDs to registry IDs. */
export const LEGACY_ACTION_ID_MAP = {
  'start-workout': AVA_ACTION_IDS.START_TODAYS_WORKOUT,
  'continue-workout': AVA_ACTION_IDS.START_TODAYS_WORKOUT,
  START_WORKOUT: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
  CONTINUE_WORKOUT: AVA_ACTION_IDS.START_TODAYS_WORKOUT,
  'open-readiness': AVA_ACTION_IDS.OPEN_READINESS,
  OPEN_READINESS: AVA_ACTION_IDS.OPEN_READINESS,
  'start-recovery': AVA_ACTION_IDS.START_RECOVERY_FLOW,
  START_RECOVERY: AVA_ACTION_IDS.START_RECOVERY_FLOW,
  OPEN_MOBILITY: AVA_ACTION_IDS.START_RECOVERY_FLOW,
  'open-nutrition': AVA_ACTION_IDS.OPEN_NUTRITION,
  OPEN_NUTRITION: AVA_ACTION_IDS.OPEN_NUTRITION,
}

export const normalizeAvaActionId = (value = '') => {
  const key = String(value ?? '').trim()
  if (!key) return null
  if (Object.values(AVA_ACTION_IDS).includes(key)) return key
  return LEGACY_ACTION_ID_MAP[key] ?? null
}
