import { createNutritionState } from './nutrition'

export const STATE_SCHEMA_VERSION = 6

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

const emptyLiftGoals = () => ({})

export function detectStoredSchemaVersion(raw = {}) {
  const explicit = Number(raw.schemaVersion)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  if (raw.liftGoals) return 6
  if (Number(raw?.nutrition?.schemaVersion) >= 4) return 5
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

  if (fromVersion < 5) {
    const nutrition = state.nutrition ?? fallback.nutrition ?? createNutritionState()
    const goals = nutrition.goals ?? {}
    const isUntouchedLegacySeed =
      Number(goals.calories) === 2200 &&
      Number(goals.protein) === 170 &&
      Number(goals.carbs) === 230 &&
      Number(goals.fat) === 70 &&
      Number(goals.fiber) === 30 &&
      [undefined, null, '', 'legacy_existing'].includes(goals.source) &&
      !goals.calculationVersion &&
      !goals.inputs &&
      !String(goals.weightGoal ?? '').trim() &&
      !Boolean(goals.coachAccess)

    state = {
      ...state,
      nutrition: {
        ...nutrition,
        schemaVersion: 4,
        goals: isUntouchedLegacySeed
          ? {
              ...createNutritionState().goals,
              timezone:
                goals.timezone ??
                createNutritionState().goals.timezone,
              waterOz:
                goals.waterOz ??
                createNutritionState().goals.waterOz,
              bottleOz:
                goals.bottleOz ??
                createNutritionState().goals.bottleOz,
              configured: false,
              source: 'not_configured',
            }
          : {
              ...goals,
              configured:
                goals.configured ??
                (Number(goals.calories) > 0 &&
                  Number(goals.protein) > 0 &&
                  Number(goals.fat) > 0),
              source:
                goals.source ??
                (Number(goals.calories) > 0
                  ? 'legacy_existing'
                  : 'not_configured'),
            },
      },
    }
  }

  if (fromVersion < 6) {
    state = {
      ...state,
      liftGoals: state.liftGoals ?? fallback.liftGoals ?? emptyLiftGoals(),
    }
  }

  return {
    ...state,
    liftGoals: state.liftGoals ?? fallback.liftGoals ?? emptyLiftGoals(),
    schemaVersion: STATE_SCHEMA_VERSION,
  }
}
