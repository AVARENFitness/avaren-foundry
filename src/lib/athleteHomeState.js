import {
  findCompletedWorkoutToday,
  resolveWorkoutRecommendation,
} from './programWorkout'
import { localCalendarDateKey } from './localCalendarDay'

export const MORNING_MOVEMENT_END_HOUR = 11
export const POST_WORKOUT_RECOVERY_WINDOW_MS = 60 * 60 * 1000

export const HOME_ACTION_IDS = {
  CONTINUE_WORKOUT: 'continue-workout',
  START_WORKOUT: 'start-workout',
  WORKOUT_COMPLETE: 'workout-complete',
  RECOVERY_FLOW: 'recovery-flow',
  MORNING_MOVEMENT: 'morning-movement',
  NUTRITION: 'nutrition',
  APPOINTMENT: 'appointment',
  READINESS: 'readiness',
  WEEKLY_CHECKIN: 'weekly-checkin',
  REST_DAY: 'rest-day',
  VIEW_SCHEDULE: 'view-schedule',
  VIEW_TRAIN: 'view-train',
}

export const localDateKey = localCalendarDateKey

export const mobilityCompletedToday = (completions = [], flowId = null) => {
  const today = localCalendarDateKey()
  return (completions ?? []).some((item) => {
    const date = item?.completedAt
      ? localCalendarDateKey(new Date(item.completedAt))
      : ''
    return date === today && (!flowId || item?.flowId === flowId)
  })
}

export const resolveLastWorkoutCompletion = (history = [], now = new Date()) => {
  const session = findCompletedWorkoutToday(history, now)
  if (!session) return null

  const completedAtRaw =
    session.finishedAt ??
    (session.date ? `${session.date}T12:00:00` : null)

  if (!completedAtRaw) return null

  const completedAt = new Date(completedAtRaw)
  if (!Number.isFinite(completedAt.getTime())) return null

  return {
    session,
    completedAt,
    completedAtMs: completedAt.getTime(),
    workoutName: session.name ?? null,
  }
}

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
  const elapsed = now.getTime() - completedAtMs
  return elapsed >= 0 && elapsed <= windowMs
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
} = {}) => {
  if (movementDone || todayTrained || !hasTrainingToday) return false
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
  const recommendation =
    workoutRecommendation ??
    resolveWorkoutRecommendation(
      state,
      { assignments, activeCoachAssignment, now },
      now,
    )

  const activeWorkout = state.activeWorkout ?? null
  const todayTrained = Boolean(recommendation.completedToday)
  const completion = resolveLastWorkoutCompletion(state.history, now)
  const movementDone = mobilityCompletedToday(
    state.mobility?.completed,
    'daily-reset',
  )
  const recoveryDone = mobilityCompletedToday(
    state.mobility?.completed,
    'recovery-flow',
  )
  const hasTrainingToday = Boolean(
    recommendation.todayWorkout ||
      recommendation.todayContext?.name ||
      (!recommendation.todayContext?.isRestDay && recommendation.nextWorkout),
  )
  const inRecoveryWindow = isWithinPostWorkoutRecoveryWindow(
    completion?.completedAtMs,
    now,
  )
  const morningMovementEligible = shouldShowMorningMovementOnHome({
    now,
    movementDone,
    todayTrained,
    hasTrainingToday,
    loadAdjusted,
    readinessFactors,
  })

  const sections = {
    avaBriefing: true,
    nextAppointment: Boolean(nextAppointment),
    todayPlan: true,
    weekStrip: Boolean(nextAppointment),
    essentials: readinessDue || weeklyCheckInDue,
    dailyEssentials: true,
    morningMovementPrimary: morningMovementEligible,
    recoveryPrimary:
      todayTrained && inRecoveryWindow && !recoveryDone && !activeWorkout,
    nutritionPrimary:
      todayTrained &&
      !activeWorkout &&
      (!inRecoveryWindow || recoveryDone),
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
  } else if (sections.recoveryPrimary) {
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.RECOVERY_FLOW,
      eyebrow: 'POST-WORKOUT',
      label: 'Recovery Flow',
      detail: completion?.workoutName
        ? `After ${completion.workoutName}`
        : 'Close out today\'s session',
      priority: 88,
    })
  } else if (sections.nutritionPrimary) {
    const calories = Number(nutritionSummary?.calories ?? 0)
    primary = buildHomeAction({
      id: HOME_ACTION_IDS.NUTRITION,
      eyebrow: 'FUEL TODAY',
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

  if (todayTrained && inRecoveryWindow && !recoveryDone && primary?.id !== HOME_ACTION_IDS.RECOVERY_FLOW) {
    secondary.push(
      buildHomeAction({
        id: HOME_ACTION_IDS.RECOVERY_FLOW,
        label: 'Recovery Flow',
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
    isMorningMovementWindow(now) &&
    !movementDone &&
    !todayTrained &&
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
