import { WORKOUT_SOURCE } from './todayWorkout'

export const PROGRAMMING_OWNER = {
  COACH: 'coach',
  ATHLETE: 'athlete',
  SYSTEM: 'system',
}

export const ADJUSTMENT_POLICY = {
  ATHLETE_SAFE: 'athlete_safe',
  CONDITIONAL: 'conditional',
  COACH_REQUIRED: 'coach_required',
}

export const ATHLETE_SAFE_ACTIONS = new Set([
  'SET_SESSION_EXECUTION_FOCUS',
  'SHORTEN_SESSION',
  'PRIORITIZE_MAIN_WORK',
  'SKIP_NONESSENTIAL_ACCESSORIES',
  'KEEP_PLAN_AS_IS',
  'CLEAR_SESSION_EXECUTION_FOCUS',
])

export const CONDITIONAL_ACTIONS = new Set([
  'MOVE_SESSION',
  'MOVE_SESSION_DATE',
  'MARK_EXECUTION_RECOVERY_DAY',
])

export const COACH_REQUIRED_ACTIONS = new Set([
  'REMOVE_PROGRAMMED_EXERCISE',
  'CHANGE_SETS_REPS',
  'REPLACE_SESSION',
  'ALTER_PROGRAM_PHASE',
  'MODIFY_COACH_ASSIGNMENT',
  'DELETE_WORKOUT',
])

export const resolveProgrammingOwner = ({
  workoutSource = null,
  coachAssigned = false,
  hasCoachRelationship = false,
} = {}) => {
  if (coachAssigned || workoutSource === WORKOUT_SOURCE.COACH_ASSIGNMENT) {
    return PROGRAMMING_OWNER.COACH
  }

  if (
    workoutSource === WORKOUT_SOURCE.SCHEDULED ||
    workoutSource === WORKOUT_SOURCE.SELECTED ||
    workoutSource === WORKOUT_SOURCE.PROGRAM
  ) {
    return hasCoachRelationship ? PROGRAMMING_OWNER.ATHLETE : PROGRAMMING_OWNER.ATHLETE
  }

  if (workoutSource === WORKOUT_SOURCE.ACTIVE) {
    return coachAssigned ? PROGRAMMING_OWNER.COACH : PROGRAMMING_OWNER.ATHLETE
  }

  return PROGRAMMING_OWNER.SYSTEM
}

export const buildPlanningOwnership = ({
  todayWorkout = {},
  activeAssignment = null,
  hasCoachRelationship = false,
} = {}) => {
  const coachAssigned = Boolean(
    todayWorkout.coachAssigned || activeAssignment?.id,
  )
  const programmingOwner = resolveProgrammingOwner({
    workoutSource: todayWorkout.source,
    coachAssigned,
    hasCoachRelationship,
  })

  const coachScheduled =
    coachAssigned &&
    Boolean(
      activeAssignment?.due_date ||
        activeAssignment?.scheduled_date ||
        activeAssignment?.dueDate,
    )

  return {
    programmingOwner,
    coachAssigned,
    coachScheduled,
    hasCoachRelationship: Boolean(hasCoachRelationship),
    athleteAdjustable: true,
    adjustmentPolicy: coachAssigned
      ? [
          ADJUSTMENT_POLICY.ATHLETE_SAFE,
          ...(coachScheduled ? [] : [ADJUSTMENT_POLICY.CONDITIONAL]),
          ADJUSTMENT_POLICY.COACH_REQUIRED,
        ]
      : [
          ADJUSTMENT_POLICY.ATHLETE_SAFE,
          ADJUSTMENT_POLICY.CONDITIONAL,
        ],
    scheduleControlledByCoach: coachScheduled,
  }
}

export const classifyAdjustmentAction = (action = '') => {
  const key = String(action ?? '').trim()
  if (ATHLETE_SAFE_ACTIONS.has(key)) return ADJUSTMENT_POLICY.ATHLETE_SAFE
  if (CONDITIONAL_ACTIONS.has(key)) return ADJUSTMENT_POLICY.CONDITIONAL
  if (COACH_REQUIRED_ACTIONS.has(key)) return ADJUSTMENT_POLICY.COACH_REQUIRED
  return ADJUSTMENT_POLICY.COACH_REQUIRED
}

export const coachOwnershipLabel = (ownership = {}) => {
  if (!ownership.coachAssigned) return null
  return 'Assigned by Coach'
}

export const coachProgramProtectedCopy =
  'Your coach\u2019s program stays unchanged.'
