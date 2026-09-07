import { localCalendarDateKey } from './localCalendarDay'
import {
  DAILY_FLOW_STEP,
  DAILY_FLOW_STATUS,
  isMorningMovementFlowCompletion,
  isRecoveryFlowCompletion,
  mobilityKindCompletedToday,
  resolveDailyAthleteFlow,
  resolveLastWorkoutCompletionToday,
} from './dailyAthleteFlow'

export const MORNING_MOVEMENT_END_HOUR = 11
/** @deprecated Recovery is due for the remainder of the local day after training. */
export const POST_WORKOUT_RECOVERY_WINDOW_MS = 60 * 60 * 1000

export const HOME_ACTION_IDS = {
  CONTINUE_WORKOUT: 'continue-workout',
  START_WORKOUT: 'start-workout',
  WORKOUT_COMPLETE: 'workout-complete',
  RECOVERY_FLOW: 'recovery-flow',
  MORNING_MOVEMENT: 'morning-movement',
  NUTRITION: 'nutrition',
  FULL_BODY_STRETCH: 'full-body-stretch',
  APPOINTMENT: 'appointment',
  READINESS: 'readiness',
  WEEKLY_CHECKIN: 'weekly-checkin',
  REST_DAY: 'rest-day',
  VIEW_SCHEDULE: 'view-schedule',
  VIEW_TRAIN: 'view-train',
  REST_OF_DAY: 'rest-of-day',
}

export const localDateKey = localCalendarDateKey

export const mobilityCompletedToday = (completions = [], flowId = null, now = new Date()) => {
  if (!flowId) {
    return (completions ?? []).some((item) =>
      item?.completedAt
        ? localCalendarDateKey(new Date(item.completedAt)) ===
          localCalendarDateKey(now)
        : false,
    )
  }

  if (flowId === 'daily-reset' || flowId === 'morning-movement') {
    return mobilityKindCompletedToday(
      completions,
      isMorningMovementFlowCompletion,
      now,
    )
  }

  if (flowId === 'recovery-flow' || flowId === 'recovery') {
    return mobilityKindCompletedToday(
      completions,
      isRecoveryFlowCompletion,
      now,
    )
  }

  const today = localCalendarDateKey(now)
  return (completions ?? []).some((item) => {
    const date = item?.completedAt
      ? localCalendarDateKey(new Date(item.completedAt))
      : ''
    return date === today && item?.flowId === flowId
  })
}

export const resolveLastWorkoutCompletion = resolveLastWorkoutCompletionToday

export const isMorningMovementWindow = (
  now = new Date(),
  endHour = MORNING_MOVEMENT_END_HOUR,
) => now.getHours() < endHour

export const isWithinPostWorkoutRecoveryWindow = (
  completedAtMs,
  now = new Date(),
  windowMs = POST_WORKOUT_RECOVERY_WINDOW_MS,
) => {
  if (!Number.isFinite(completedAtMs)) return false
  // Local-day recovery: due until midnight of the workout's local day.
  const completedAt = new Date(completedAtMs)
  if (!Number.isFinite(completedAt.getTime())) return false
  return localCalendarDateKey(completedAt) === localCalendarDateKey(now)
}

export const resolveMorningMovementSuggested = ({
  loadAdjusted = false,
  readinessFactors = [],
} = {}) => {
  const concernCount = (readinessFactors ?? []).filter(
    (factor) => factor?.concern,
  ).length
  return loadAdjusted || concernCount > 0
}

export const shouldShowMorningMovementOnHome = ({
  now = new Date(),
  movementDone = false,
  todayTrained = false,
  hasTrainingToday = true,
  loadAdjusted = false,
  readinessFactors = [],
  morningSkipped = false,
  activeWorkout = null,
} = {}) => {
  if (
    movementDone ||
    morningSkipped ||
    todayTrained ||
    activeWorkout ||
    !hasTrainingToday
  ) {
    return false
  }
  if (!isMorningMovementWindow(now)) return false
  return resolveMorningMovementSuggested({ loadAdjusted, readinessFactors })
}

export const shouldSuppressWorkoutReminder = ({
  todayTrained = false,
  activeWorkout = null,
} = {}) => Boolean(todayTrained || activeWorkout)

export const buildHomeAction = ({
  id,
  label,
  detail = null,
  eyebrow = null,
  priority = 0,
  meta = {},
} = {}) => ({
  id,
  label,
  detail,
  eyebrow,
  priority,
  meta,
})

/**
 * Canonical athlete Home priority model.
 * Returns primary/secondary actions and section visibility for Home rendering.
 */
export const getAthleteHomeState = ({
  now = new Date(),
  state = {},
  workoutRecommendation = null,
  readiness = null,
  nutritionSummary = null,
  nextAppointment = null,
  weeklyCheckInDue = false,
  readinessDue = false,
  weeklyCheckInRequired = true,
  loadAdjusted = false,
  readinessFactors = [],
  assignments = [],
  activeCoachAssignment = null,
} = {}) => {
  const flow = resolveDailyAthleteFlow({
    now,
    state,
    workoutRecommendation,
    readiness,
    readinessDue,
    weeklyCheckInDue,
    weeklyCheckInRequired,
    loadAdjusted,
    readinessFactors,
    assignments,
    activeCoachAssignment,
    morningMovementEndHour: MORNING_MOVEMENT_END_HOUR,
  })

  const recommendation = flow.recommendation
  const activeWorkout = flow.activeWorkout
  const todayTrained = flow.todayTrained
  const completion = resolveLastWorkoutCompletion(state.history, now)
  const movementDone = flow.morningMovement.completed
  const recoveryDone = flow.recovery.completed
  const morningMovementEligible =
    flow.morningMovement.status === DAILY_FLOW_STATUS.DUE
  const inRecoveryWindow = flow.recovery.due || flow.recovery.completed
  const recoveryPrimary = flow.recovery.due && !activeWorkout
  const restOfDay = flow.requiredFlowComplete || (
    todayTrained &&
    recoveryDone &&
    !activeWorkout
  )
  const nutritionPrimary = restOfDay

  const sections = {
    avaBriefing: true,
    nextAppointment: Boolean(nextAppointment),
    todayPlan: true,
    weekStrip: Boolean(nextAppointment),
    essentials: readinessDue || weeklyCheckInDue,
    dailyEssentials: true,
    morningMovementPrimary: morningMovementEligible,
    recoveryPrimary,
    nutritionPrimary,
    stretchOptional: Boolean(flow.stretch.optionalAvailable),
    restOfDay,
    showNextWorkoutPreview: false,
    showStartWorkoutPrimary: false,
    showWorkoutCompleteState: todayTrained && !activeWorkout,
  }

  const secondary = []
  let primary = null

  if (activeWorkout?.name) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.CONTINUE_WORKOUT,
      eyebrow: 'IN PROGRESS',
      label: `Continue ${activeWorkout.name}`,
      priority: 100,
      meta: { workoutName: activeWorkout.name },
    })
    sections.showStartWorkoutPrimary = false
  } else if (weeklyCheckInDue && weeklyCheckInRequired && readiness?.completed) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.WEEKLY_CHECKIN,
      eyebrow: 'WEEKLY CHECK-IN',
      label: 'Complete Weekly Check-In',
      priority: 95,
    })
  } else if (readinessDue) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.READINESS,
      eyebrow: 'DAILY READINESS',
      label: "Complete Today's Readiness",
      priority: 90,
    })
  } else if (morningMovementEligible) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.MORNING_MOVEMENT,
      eyebrow: 'MORNING MOVEMENT',
      label: 'Morning Movement',
      detail: 'Prepare for today\'s training',
      priority: 75,
    })
  } else if (
    !todayTrained &&
    recommendation.todayWorkout &&
    !recommendation.todayContext?.isRestDay
  ) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.START_WORKOUT,
      eyebrow: 'TODAY',
      label: 'Start Session',
      detail: recommendation.todayWorkout,
      priority: 70,
      meta: {
        workoutName: recommendation.todayWorkout,
        assignmentId: activeCoachAssignment?.id ?? null,
      },
    })
    sections.showStartWorkoutPrimary = true
  } else if (recoveryPrimary) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.RECOVERY_FLOW,
      eyebrow: 'POST-WORKOUT',
      label: 'Start recovery flow',
      detail: completion?.workoutName
        ? `After ${completion.workoutName}`
        : 'Close out today\'s session',
      priority: 88,
    })
  } else if (nutritionPrimary) {
    const calories = Number(nutritionSummary?.calories ?? 0)
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.NUTRITION,
      eyebrow: 'REST OF DAY',
      label: calories > 0 ? 'Continue food log' : 'Log your food',
      detail:
        calories > 0
          ? `${calories} cal logged today`
          : 'Track nutrition after training',
      priority: 85,
    })
  } else if (nextAppointment && !todayTrained) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.APPOINTMENT,
      eyebrow: 'UPCOMING SESSION',
      label: 'View coaching appointment',
      priority: 80,
      meta: { appointmentId: nextAppointment.id },
    })
  } else if (todayTrained && !activeWorkout) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.WORKOUT_COMPLETE,
      label: 'Workout complete',
      detail: completion?.workoutName ?? recommendation.completedWorkoutName,
      priority: 65,
    })
  } else if (recommendation.todayContext?.isRestDay) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.REST_DAY,
      label: 'Rest day',
      detail: 'Recovery is part of the plan',
      priority: 60,
    })
  }

  if (flow.stretch.optionalAvailable) {
    secondary.push(
      buildHomeAction({
        id: HOME_ACTION_IDS.FULL_BODY_STRETCH,
        label: 'Full-Body Stretch',
        detail: 'Optional · ~10–15 min',
        priority: 55,
      }),
    )
  }

  if (
    todayTrained &&
    flow.recovery.due &&
    primary?.id !== HOME_ACTION_IDS.RECOVERY_FLOW
  ) {
    secondary.push(
      buildHomeAction({
        id: HOME_ACTION_IDS.RECOVERY_FLOW,
        label: 'Start recovery flow',
        priority: 50,
      }),
    )
  }

  if (todayTrained && primary?.id !== HOME_ACTION_IDS.NUTRITION) {
    secondary.push(
      buildHomeAction({
        id: HOME_ACTION_IDS.NUTRITION,
        label: 'Log food',
        priority: 45,
      }),
    )
  }

  if (nextAppointment) {
    secondary.push(
      buildHomeAction({
        id: HOME_ACTION_IDS.APPOINTMENT,
        label: 'View schedule',
        priority: 40,
        meta: { appointmentId: nextAppointment.id },
      }),
    )
  }

  if (
    morningMovementEligible &&
    primary?.id !== HOME_ACTION_IDS.MORNING_MOVEMENT
  ) {
    secondary.push(
      buildHomeAction({
        id: HOME_ACTION_IDS.MORNING_MOVEMENT,
        label: 'Morning Movement',
        priority: 35,
      }),
    )
  }

  return {
    now,
    localDateKey: localDateKey(now),
    dailyFlow: flow,
    recommendation,
    completion,
    todayTrained,
    activeWorkout,
    inRecoveryWindow,
    morningMovementEligible,
    suppressWorkoutReminder: shouldSuppressWorkoutReminder({
      todayTrained,
      activeWorkout,
    }),
    primaryAction: primary,
    secondaryActions: secondary.sort((a, b) => b.priority - a.priority),
    sections,
  }
}

export {
  DAILY_FLOW_STEP,
  DAILY_FLOW_STATUS,
  resolveDailyAthleteFlow,
}
