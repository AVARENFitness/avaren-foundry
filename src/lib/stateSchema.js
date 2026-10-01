import { createNutritionState } from './nutrition'

export const STATE_SCHEMA_VERSION = 4

const emptyMobility = () => ({
  durationPreferences: {},
  completed: [],
  daily: {},
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
  if (Number(raw?.nutrition?.schemaVersion) >= 3) return 4
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

  if (fromVersion < 4) {
    const nutrition = state.nutrition ?? fallback.nutrition ?? createNutritionState()
    const goals = nutrition.goals ?? {}
    const hasLegacyTargets =
      Number(goals.calories) > 0 &&
      Number(goals.protein) > 0 &&
      Number(goals.fat) > 0

    state = {
      ...state,
      nutrition: {
        ...nutrition,
        schemaVersion: 3,
        goals: hasLegacyTargets
          ? {
              ...goals,
              configured: true,
              source: goals.source ?? 'legacy_existing',
              calculationVersion: goals.calculationVersion ?? null,
            }
          : {
              ...createNutritionState().goals,
              ...goals,
              configured: false,
              source: 'not_configured',
            },
      },
    }
  }

  return {
    ...state,
    schemaVersion: STATE_SCHEMA_VERSION,
  }
}
