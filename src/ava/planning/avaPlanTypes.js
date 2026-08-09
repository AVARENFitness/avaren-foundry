export const PLAN_TYPES = {
  DAILY: 'DAILY_PLAN',
  WEEK: 'WEEK_PLAN',
}

export const PROPOSAL_TYPES = {
  DAILY: 'DAILY_PLAN_PROPOSAL',
  WEEK: 'WEEK_PLAN_PROPOSAL',
}

export const PROPOSAL_STATUS = {
  DRAFT: 'draft',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  APPLYING: 'applying',
  APPLIED: 'applied',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  STALE: 'stale',
}

export const PLAN_CHANGE_ACTIONS = {
  SHORTEN_SESSION: 'SHORTEN_SESSION',
  PRIORITIZE_SESSION: 'PRIORITIZE_SESSION',
  MOVE_SESSION: 'MOVE_SESSION',
  MARK_RECOVERY_DAY: 'MARK_RECOVERY_DAY',
  KEEP_PLAN_AS_IS: 'KEEP_PLAN_AS_IS',
  SKIP_NONESSENTIAL_ACCESSORIES: 'SKIP_NONESSENTIAL_ACCESSORIES',
  SET_SESSION_EXECUTION_FOCUS: 'SET_SESSION_EXECUTION_FOCUS',
}

export const ALLOWED_PLAN_CHANGE_ACTIONS = new Set([
  PLAN_CHANGE_ACTIONS.SHORTEN_SESSION,
  PLAN_CHANGE_ACTIONS.PRIORITIZE_SESSION,
  PLAN_CHANGE_ACTIONS.MOVE_SESSION,
  PLAN_CHANGE_ACTIONS.MARK_RECOVERY_DAY,
  PLAN_CHANGE_ACTIONS.KEEP_PLAN_AS_IS,
  PLAN_CHANGE_ACTIONS.SKIP_NONESSENTIAL_ACCESSORIES,
  PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS,
])

export const CONSTRAINT_TYPES = {
  TIME_LIMIT: 'time_limit',
  UNAVAILABLE_DAY: 'unavailable_day',
  TRAVEL: 'travel',
  EQUIPMENT: 'equipment',
  EFFORT_PREFERENCE: 'effort_preference',
  SUBJECTIVE_RECOVERY: 'subjective_recovery',
  PAIN_OR_DISCOMFORT: 'pain_or_discomfort',
  MISSED_SESSION: 'missed_session',
  LIGHTER_WEEK: 'lighter_week',
}

export const CONSTRAINT_SOURCE = {
  USER_MESSAGE: 'user_message',
  SESSION: 'session',
  TRUSTED_STATE: 'trusted_state',
}

export const DAY_STATUS = {
  COMPLETED: 'completed',
  MISSED: 'missed',
  TODAY: 'today',
  UPCOMING: 'upcoming',
  REST: 'rest',
  RECOVERY: 'recovery',
}

export const EXECUTION_FOCUS_PRIORITY = {
  MAIN_WORK: 'main_work',
  PRIORITY_MOVEMENTS: 'priority_movements',
}

export const createEmptyDailyPlan = (date = null) => ({
  date,
  primaryAction: null,
  workout: null,
  recovery: null,
  readinessContext: null,
  timeConstraint: null,
  userConstraints: [],
  coachAssignment: null,
  supportingActions: [],
  rationale: [],
  sessionExecutionPlan: null,
})

export const createEmptyWeekPlan = (weekStart = null) => ({
  weekStart,
  days: [],
})
