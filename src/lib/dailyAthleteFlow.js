import { localCalendarDateKey } from './localCalendarDay'
import {
  findCompletedWorkoutToday,
  resolveWorkoutRecommendation,
} from './programWorkout'

export const DAILY_FLOW_STEP = {
  CHECK_IN: 'check_in',
  MORNING_MOVEMENT: 'morning_movement',
  WORKOUT: 'workout',
  RECOVERY: 'recovery',
  REST_OF_DAY: 'rest_of_day',
}

export const DAILY_FLOW_STATUS = {
  DUE: 'due',
  COMPLETED: 'completed',
  SKIPPED_FOR_TODAY: 'skipped_for_today',
  NOT_YET_RELEVANT: 'not_yet_relevant',
  AVAILABLE: 'available',
  STARTED: 'started',
  COMPLETED_TODAY: 'completed_today',
  OPTIONAL_AVAILABLE: 'optional_available',
  NOT_REQUIRED: 'not_required',
}

const isSameLocalDay = (isoOrDate, now = new Date()) => {
  if (!isoOrDate) return false
  const date =
    isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  if (!Number.isFinite(date.getTime())) return false
  return localCalendarDateKey(date) === localCalendarDateKey(now)
}

export const isMorningMovementFlowCompletion = (entry = {}) => {
  const flowId = String(entry?.flowId ?? entry?.id ?? '')
  const title = String(entry?.title ?? '')
  if (entry?.kind === 'morning_movement') return true
  if (flowId === 'daily-reset' || flowId.startsWith('daily-reset-')) return true
  if (/morning movement/i.test(title)) return true
  return false
}

export const isRecoveryFlowCompletion = (entry = {}) => {
  const flowId = String(entry?.flowId ?? entry?.id ?? '')
  const title = String(entry?.title ?? '')
  if (entry?.kind === 'recovery') return true
  if (flowId === 'recovery-flow' || flowId.startsWith('recovery-')) return true
  if (/^recovery flow$/i.test(title)) return true
  // Legacy writer title from buildRecoveryFlow before title normalization.
  if (/^daily reset$/i.test(title) && flowId.startsWith('recovery-')) return true
  return false
}

export const isFullBodyStretchCompletion = (entry = {}) => {
  const flowId = String(entry?.flowId ?? entry?.id ?? '')
  const title = String(entry?.title ?? '')
  if (entry?.kind === 'full_body_stretch') return true
  if (flowId === 'full-body-stretch' || flowId.startsWith('full-body-stretch-')) {
    return true
  }
  if (/full-?body stretch/i.test(title)) return true
  return false
}

export const mobilityKindCompletedToday = (
  completions = [],
  predicate,
  now = new Date(),
) =>
  (completions ?? []).some(
    (entry) =>
      predicate(entry) && isSameLocalDay(entry?.completedAt, now),
  )

export const isMorningMovementSkippedForToday = (
  mobility = {},
  now = new Date(),
) => {
  const day = localCalendarDateKey(now)
  return String(mobility?.daily?.morningSkippedForDate ?? '') === day
}

export const withMorningMovementSkippedForToday = (
  state = {},
  now = new Date(),
) => {
  const day = localCalendarDateKey(now)
  const mobility = state.mobility ?? {}
  if (String(mobility?.daily?.morningSkippedForDate ?? '') === day) {
    return state
  }
  if (
    mobilityKindCompletedToday(
      mobility.completed,
      isMorningMovementFlowCompletion,
      now,
    )
  ) {
    return state
  }

  return {
    ...state,
    mobility: {
      ...mobility,
      durationPreferences: mobility.durationPreferences ?? {},
      completed: mobility.completed ?? [],
      daily: {
        ...(mobility.daily ?? {}),
        morningSkippedForDate: day,
      },
    },
  }
}

export const resolveMobilityCompletionKind = (flow = {}) => {
  const flowId = String(flow?.id ?? '')
  const title = String(flow?.title ?? '')
  if (
    flowId.startsWith('full-body-stretch') ||
    /full-?body stretch/i.test(title)
  ) {
    return 'full_body_stretch'
  }
  if (flowId.startsWith('recovery') || /^recovery flow$/i.test(title)) {
    return 'recovery'
  }
  if (
    flowId === 'daily-reset' ||
    flowId.startsWith('daily-reset-') ||
    /morning movement/i.test(title)
  ) {
    return 'morning_movement'
  }
  return 'mobility'
}

/**
 * Canonical local-day athlete flow. Home + notifications must share this.
 */
export const resolveDailyAthleteFlow = ({
  now = new Date(),
  state = {},
  workoutRecommendation = null,
  readiness = null,
  readinessDue = false,
  weeklyCheckInDue = false,
  weeklyCheckInRequired = true,
  loadAdjusted = false,
  readinessFactors = [],
  assignments = [],
  activeCoachAssignment = null,
  morningMovementEndHour = 11,
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
  const completions = state.mobility?.completed ?? []

  const checkInCompleted = Boolean(readiness?.completed)
  const checkInDue = Boolean(readinessDue)

  const morningCompleted = mobilityKindCompletedToday(
    completions,
    isMorningMovementFlowCompletion,
    now,
  )
  const morningSkipped =
    isMorningMovementSkippedForToday(state.mobility, now) ||
    (Boolean(activeWorkout) && !morningCompleted) ||
    (todayTrained && !morningCompleted)

  const recoveryCompleted = mobilityKindCompletedToday(
    completions,
    isRecoveryFlowCompletion,
    now,
  )
  const stretchCompleted = mobilityKindCompletedToday(
    completions,
    isFullBodyStretchCompletion,
    now,
  )

  const hasTrainingToday = Boolean(
    recommendation.todayWorkout ||
      recommendation.todayContext?.name ||
      (!recommendation.todayContext?.isRestDay && recommendation.nextWorkout),
  )

  const inMorningWindow = now.getHours() < morningMovementEndHour
  const concernCount = (readinessFactors ?? []).filter(
    (factor) => factor?.concern,
  ).length
  const morningSuggested = Boolean(loadAdjusted || concernCount > 0)

  let morningStatus = DAILY_FLOW_STATUS.NOT_REQUIRED
  if (!hasTrainingToday) {
    morningStatus = DAILY_FLOW_STATUS.NOT_REQUIRED
  } else if (morningCompleted) {
    morningStatus = DAILY_FLOW_STATUS.COMPLETED
  } else if (morningSkipped) {
    morningStatus = DAILY_FLOW_STATUS.SKIPPED_FOR_TODAY
  } else if (inMorningWindow && morningSuggested) {
    morningStatus = DAILY_FLOW_STATUS.DUE
  } else {
    morningStatus = DAILY_FLOW_STATUS.NOT_REQUIRED
  }

  let workoutStatus = DAILY_FLOW_STATUS.AVAILABLE
  if (activeWorkout) workoutStatus = DAILY_FLOW_STATUS.STARTED
  else if (todayTrained) workoutStatus = DAILY_FLOW_STATUS.COMPLETED_TODAY
  else if (recommendation.todayContext?.isRestDay) {
    workoutStatus = DAILY_FLOW_STATUS.NOT_REQUIRED
  }

  let recoveryStatus = DAILY_FLOW_STATUS.NOT_YET_RELEVANT
  if (todayTrained && recoveryCompleted) {
    recoveryStatus = DAILY_FLOW_STATUS.COMPLETED
  } else if (todayTrained && !activeWorkout) {
    recoveryStatus = DAILY_FLOW_STATUS.DUE
  }

  const requiredFlowComplete =
    !checkInDue &&
    (morningStatus === DAILY_FLOW_STATUS.COMPLETED ||
      morningStatus === DAILY_FLOW_STATUS.SKIPPED_FOR_TODAY ||
      morningStatus === DAILY_FLOW_STATUS.NOT_REQUIRED) &&
    todayTrained &&
    recoveryStatus === DAILY_FLOW_STATUS.COMPLETED

  let primaryStep = DAILY_FLOW_STEP.REST_OF_DAY
  if (activeWorkout) {
    primaryStep = DAILY_FLOW_STEP.WORKOUT
  } else if (weeklyCheckInDue && weeklyCheckInRequired && checkInCompleted) {
    primaryStep = DAILY_FLOW_STEP.CHECK_IN
  } else if (checkInDue) {
    primaryStep = DAILY_FLOW_STEP.CHECK_IN
  } else if (morningStatus === DAILY_FLOW_STATUS.DUE) {
    primaryStep = DAILY_FLOW_STEP.MORNING_MOVEMENT
  } else if (!todayTrained && !recommendation.todayContext?.isRestDay) {
    primaryStep = DAILY_FLOW_STEP.WORKOUT
  } else if (recoveryStatus === DAILY_FLOW_STATUS.DUE) {
    primaryStep = DAILY_FLOW_STEP.RECOVERY
  } else {
    primaryStep = DAILY_FLOW_STEP.REST_OF_DAY
  }

  return {
    localDateKey: localCalendarDateKey(now),
    primaryStep,
    requiredFlowComplete,
    checkIn: {
      status: checkInDue
        ? DAILY_FLOW_STATUS.DUE
        : checkInCompleted
          ? DAILY_FLOW_STATUS.COMPLETED
          : DAILY_FLOW_STATUS.NOT_REQUIRED,
      due: checkInDue,
      completed: checkInCompleted,
    },
    morningMovement: {
      status: morningStatus,
      due: morningStatus === DAILY_FLOW_STATUS.DUE,
      completed: morningCompleted,
      skippedForToday: morningStatus === DAILY_FLOW_STATUS.SKIPPED_FOR_TODAY,
    },
    workout: {
      status: workoutStatus,
      available: workoutStatus === DAILY_FLOW_STATUS.AVAILABLE,
      started: workoutStatus === DAILY_FLOW_STATUS.STARTED,
      completedToday: todayTrained,
    },
    recovery: {
      status: recoveryStatus,
      due: recoveryStatus === DAILY_FLOW_STATUS.DUE,
      completed: recoveryCompleted,
      notYetRelevant: recoveryStatus === DAILY_FLOW_STATUS.NOT_YET_RELEVANT,
    },
    stretch: {
      status: requiredFlowComplete
        ? stretchCompleted
          ? DAILY_FLOW_STATUS.COMPLETED
          : DAILY_FLOW_STATUS.OPTIONAL_AVAILABLE
        : DAILY_FLOW_STATUS.NOT_YET_RELEVANT,
      optionalAvailable: requiredFlowComplete,
      completed: stretchCompleted,
    },
    recommendation,
    todayTrained,
    activeWorkout,
    hasTrainingToday,
  }
}

export const resolveLastWorkoutCompletionToday = (
  history = [],
  now = new Date(),
) => {
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
