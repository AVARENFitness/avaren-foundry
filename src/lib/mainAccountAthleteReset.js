import { BASELINES, DEFAULT_PROGRAM } from '../data/defaultProgram'
import { STATE_SCHEMA_VERSION } from './stateSchema'
import { createNutritionState } from './nutrition'
import { coachOwnerEmail } from '../config/coachAccess'

export const MAIN_ACCOUNT_OWNER_EMAIL = coachOwnerEmail

export const DEFAULT_WEEKLY_SCHEDULE = {
  0: 'Rest',
  1: 'Chest + Back',
  2: 'Arms',
  3: 'Legs + Core',
  4: 'Chest + Back',
  5: 'Arms',
  6: 'Legs + Core',
}

export const REUSABLE_COACH_DEFINITION_TABLES = [
  'coach_programs',
  'coach_workout_templates',
]

export const buildDefaultAthleteProgramState = () => ({
  program: structuredClone(DEFAULT_PROGRAM),
  weeklySchedule: { ...DEFAULT_WEEKLY_SCHEDULE },
  selectedWorkout: DEFAULT_PROGRAM.nextWorkout,
  baselines: { ...BASELINES },
})

export const FOUNDRY_RESET_DEFAULT_SLICES = buildDefaultAthleteProgramState()

/**
 * Assignment rows where the main user is the athlete subject.
 * Excludes coach->client assignments (coach_id = target, athlete_id <> target).
 */
export const ATHLETE_SUBJECT_ASSIGNMENT_PREDICATE =
  'athlete_id = target'

export const SELF_ASSIGNED_ASSIGNMENT_PREDICATE =
  'athlete_id = target AND coach_id = target'

export const CLIENT_COACH_ASSIGNMENT_PREDICATE =
  'coach_id = target AND athlete_id <> target'

export const shouldPreserveCoachAssignmentRow = (
  row = {},
  targetUserId,
) =>
  String(row.coach_id ?? row.coachId ?? '') === String(targetUserId) &&
  String(row.athlete_id ?? row.athleteId ?? '') !== String(targetUserId)

export const shouldResetCoachAssignmentRow = (row = {}, targetUserId) => {
  const athleteId = String(row.athlete_id ?? row.athleteId ?? '')
  if (!athleteId || athleteId !== String(targetUserId)) return false
  return !shouldPreserveCoachAssignmentRow(row, targetUserId)
}

export const isSelfAssignedCoachAssignment = (row = {}, targetUserId) => {
  const coachId = String(row.coach_id ?? row.coachId ?? '')
  const athleteId = String(row.athlete_id ?? row.athleteId ?? '')
  return coachId === String(targetUserId) && athleteId === String(targetUserId)
}

/**
 * Tables / concepts wiped when the user is the athlete SUBJECT only.
 * Coach-owned client rows (coach_id = target, athlete_id <> target) are excluded.
 */
export const ATHLETE_RESET_TABLES = [
  {
    table: 'foundry_state',
    predicate: 'user_id = target',
    action: 'patch_json',
    class: 'A',
  },
  {
    table: 'nutrition_days',
    predicate: 'user_id = target',
    action: 'delete',
    class: 'A',
  },
  {
    table: 'athlete_weekly_check_ins',
    predicate: 'athlete_id = target',
    action: 'delete',
    class: 'A',
  },
  {
    table: 'coach_assignments',
    predicate: ATHLETE_SUBJECT_ASSIGNMENT_PREDICATE,
    action: 'delete',
    class: 'C',
    note: 'Deletes assignment instances where main user is athlete subject, including self-assigned test rows. Preserves coach_id = target AND athlete_id <> target.',
  },
  {
    table: 'coach_schedule_items',
    predicate: 'athlete_id = target',
    action: 'delete',
    class: 'C',
  },
  {
    table: 'coach_session_history',
    predicate: 'athlete_id = target',
    action: 'delete',
    class: 'C',
  },
  {
    table: 'coach_session_packages',
    predicate: 'athlete_id = target',
    action: 'delete',
    class: 'C',
  },
  {
    table: 'coach_client_followups',
    predicate: 'athlete_id = target',
    action: 'delete',
    class: 'C',
    note: 'Athlete-submitted follow-ups only. Coach-managed client followups (athlete_id <> target) preserved.',
  },
  {
    table: 'coach_notifications',
    predicate: `recipient_id = target AND type IN (
      'appointment-scheduled',
      'appointment-rescheduled',
      'appointment-cancelled',
      'appointment-athlete-reminder-2h',
      'assignment-created',
      'assignment-due',
      'assignment-overdue'
    )`,
    action: 'delete',
    class: 'C',
    note: 'Athlete-facing notification history only. Coach RSVP/reminder rows preserved.',
  },
  {
    table: 'appointment_notification_deliveries',
    predicate: "recipient_user_id = target AND recipient_role = 'athlete'",
    action: 'delete',
    class: 'C',
  },
]

export const PRESERVE_TABLES = [
  'auth.users',
  'user_profiles',
  'coach_allowlist',
  'push_subscriptions',
  'coach_business_clients',
  'coach_business_client_notes',
  'coach_client_passes',
  'coach_client_pass_ledger',
  'coach_clients',
  'coach_invitations',
  'coach_assignments',
  'coach_scheduled_sessions',
  ...REUSABLE_COACH_DEFINITION_TABLES,
  'coach_client_notes',
  'coach_client_labels',
  'coach_weekly_reviews',
  'coach_client_followups',
  'coach_notifications',
  'appointment_notification_deliveries',
  'nutrition_profiles',
]

export const AMBIGUOUS_DECISIONS = [
  {
    topic: 'nutrition_profiles',
    default: 'preserve_goals',
    note: 'Keeps macro/goals JSON; only nutrition_days logs are wiped.',
  },
  {
    topic: 'foundry_state.onboarding',
    default: 'preserve_completed',
    note: 'Keeps onboarding.completed=true so Home does not replay first-run onboarding.',
  },
  {
    topic: 'foundry_state.program / weeklySchedule',
    default: 'reset_to_defaults',
    note: 'Rebuild from canonical DEFAULT_PROGRAM + default weekly schedule; do not copy old dev rotation.',
  },
  {
    topic: 'coach_scheduled_sessions where athlete_id = target AND coach_id <> target',
    default: 'preserve_report_only',
    note: 'Preserved by default. Precheck reports counts; delete only after manual review.',
  },
  {
    topic: 'coach_assignments where coach_id = target AND athlete_id = target',
    default: 'reset_self_assigned_instances',
    note: 'Delete assignment instance only. coach_programs / coach_workout_templates remain untouched.',
  },
  {
    topic: 'coach_business_clients.linked_user_id = target',
    default: 'preserve',
    note: 'If main user is linked as a client of another coach — business row is not athlete training history.',
  },
]

const emptyReadiness = () => ({
  entries: [],
  lastPromptedDate: null,
})

const emptyNotifications = () => ({
  read: [],
  dismissed: [],
  actedOn: [],
})

const emptyMobilityCompleted = (mobility = {}) => ({
  ...mobility,
  completed: [],
})

/**
 * Returns athlete-side foundry_state with behavioral/history fields cleared and
 * program rotation rebuilt from canonical defaults.
 */
export const buildFreshAthleteFoundryState = (currentState = {}, { now = new Date() } = {}) => {
  const nutritionDefaults = createNutritionState()
  const nutrition = currentState.nutrition ?? nutritionDefaults
  const programDefaults = buildDefaultAthleteProgramState()

  return {
    ownerUserId: currentState.ownerUserId ?? null,
    schemaVersion: STATE_SCHEMA_VERSION,
    ...programDefaults,
    activeWorkout: null,
    history: [],
    achievements: [],
    sessionExecutionPlan: null,
    athleteFollowUps: [],
    mobility: emptyMobilityCompleted(currentState.mobility ?? {}),
    readiness: emptyReadiness(),
    notifications: emptyNotifications(),
    coach: {
      history: [],
      lastShownInsight: null,
    },
    coachWorkspace: {
      role: currentState.coachWorkspace?.role ?? 'athlete',
      modeEnabled: Boolean(currentState.coachWorkspace?.modeEnabled),
      clients: [],
      invitations: [],
      assignments: [],
    },
    nutrition: {
      ...nutritionDefaults,
      ...nutrition,
      days: {},
      recentFoodIds: [],
    },
    onboarding: {
      completed: true,
      completedAt:
        currentState.onboarding?.completedAt ??
        currentState.onboarding?.completed_at ??
        now.toISOString(),
    },
    lastSavedAt: now.toISOString(),
  }
}

export const LOCAL_ATHLETE_RESET_KEYS = [
  { key: 'avaren-foundry-user:{userId}', action: 'replace_with_fresh_state' },
  { key: 'avaren-foundry-last-backup:{userId}', action: 'remove' },
]

export const LOCAL_PRESERVED_KEYS = [
  'avaren:last-mode:{userId}',
  'supabase.auth.token',
]

export const buildLocalAthleteStorageKey = (userId) =>
  `avaren-foundry-user:${String(userId)}`

export const buildLocalAthleteBackupMetaKey = (userId) =>
  `avaren-foundry-last-backup:${String(userId)}`

export const applyLocalAthleteReset = ({
  userId,
  currentState = {},
  now = new Date(),
} = {}) => {
  if (!userId || typeof window === 'undefined') {
    return { applied: false, nextState: null }
  }

  const freshState = buildFreshAthleteFoundryState(
    { ...currentState, ownerUserId: userId },
    { now },
  )

  window.localStorage.setItem(
    buildLocalAthleteStorageKey(userId),
    JSON.stringify(freshState),
  )
  window.localStorage.removeItem(buildLocalAthleteBackupMetaKey(userId))

  return { applied: true, nextState: freshState }
}

export const resolveMainAccountTargetFromSession = (session) => {
  const email = String(session?.user?.email ?? '').trim().toLowerCase()
  const userId = session?.user?.id ?? null

  return {
    userId,
    email,
    matchesPrimaryOwner:
      Boolean(email) &&
      Boolean(MAIN_ACCOUNT_OWNER_EMAIL) &&
      email === MAIN_ACCOUNT_OWNER_EMAIL.toLowerCase(),
  }
}
