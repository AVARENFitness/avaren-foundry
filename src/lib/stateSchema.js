import { createNutritionState } from './nutrition'

export const STATE_SCHEMA_VERSION = 3

const emptyMobility = () => ({
  durationPreferences: {},
  completed: [],
})

const emptyReadiness = () => ({
  entries: [],
  lastPromptedDate: null,
})

const emptyNotifications = () => ({
  read: [],
  dismissed: [],
  actedOn: [],
})

const emptyOnboarding = () => ({
  completed: false,
  completedAt: null,
})

const emptyCoach = () => ({
  history: [],
  lastShownInsight: null,
})

const emptyCoachWorkspace = () => ({
  role: 'athlete',
  modeEnabled: false,
  clients: [],
  invitations: [],
  assignments: [],
})

export function detectStoredSchemaVersion(raw = {}) {
  const explicit = Number(raw.schemaVersion)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  if (raw.nutrition) return 3
  if (
    raw.mobility ||
    raw.readiness ||
    raw.notifications ||
    raw.onboarding ||
    raw.coachWorkspace
  ) {
    return 2
  }
  return 1
}

export function migrateStoredState(raw = {}, fallback = {}) {
  let state = { ...raw }
  const fromVersion = detectStoredSchemaVersion(raw)

  if (fromVersion < 2) {
    state = {
      ...state,
      mobility: state.mobility ?? fallback.mobility ?? emptyMobility(),
      readiness: state.readiness ?? fallback.readiness ?? emptyReadiness(),
      notifications:
        state.notifications ??
        fallback.notifications ??
        emptyNotifications(),
      onboarding:
        state.onboarding ?? fallback.onboarding ?? emptyOnboarding(),
      coach: state.coach ?? fallback.coach ?? emptyCoach(),
      coachWorkspace:
        state.coachWorkspace ??
        fallback.coachWorkspace ??
        emptyCoachWorkspace(),
    }
  }

  if (fromVersion < 3) {
    state = {
      ...state,
      nutrition:
        state.nutrition ??
        fallback.nutrition ??
        createNutritionState(),
    }
  }

  return {
    ...state,
    schemaVersion: STATE_SCHEMA_VERSION,
  }
}
