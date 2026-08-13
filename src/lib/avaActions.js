import { TRAINING_RECOMMENDATIONS } from './trainingRecommendations'
import { FOCUS_ACTIONS } from './todaysFocus'

const DAILY_STATE = {
  READY: 'ready',
  READY_WITH_ADJUSTMENT: 'ready-with-adjustment',
  MANAGE_LOAD: 'manage-load',
  RECOVERY_PRIORITY: 'recovery-priority',
  REST: 'rest',
  INSUFFICIENT_DATA: 'insufficient-data',
}

export const AVA_ACTION_TYPES = {
  CONTINUE_WORKOUT: 'continue-workout',
  CHECK_READINESS: 'check-readiness',
  OPEN_WEEKLY_CHECKIN: 'open-weekly-checkin',
  START_WORKOUT: 'start-workout',
  MORNING_MOVEMENT: 'morning-movement',
  RECOVERY_FLOW: 'recovery-flow',
  REST: 'rest',
  BUILD_BASELINE: 'build-baseline',
  VIEW_PLAN: 'view-plan',
}

const formatWorkoutName = (name) => {
  if (!name) return null
  return String(name).replace(/\s*\+\s*/g, ' & ')
}

const buildAction = ({
  type,
  focusAction,
  label,
  eyebrow,
  detail,
  meta = {},
}) => ({
  type,
  focusAction,
  label,
  eyebrow,
  detail,
  meta,
})

const isWorkoutCompleteToday = (ctx) =>
  Boolean(
    ctx.workoutRecommendation?.completedToday ??
      ctx.workoutContext?.completedToday,
  )

const resolveTodayWorkoutName = (ctx) =>
  ctx.workoutRecommendation?.todayWorkout ??
  ctx.workoutContext?.displayName ??
  null

const hasTrainingToday = (ctx, dailyState) => {
  const workoutName = resolveTodayWorkoutName(ctx)
  if (isWorkoutCompleteToday(ctx) && !workoutName) {
    return false
  }
  return (
    Boolean(workoutName) &&
    dailyState !== DAILY_STATE.REST &&
    dailyState !== DAILY_STATE.RECOVERY_PRIORITY
  )
}

export const shouldSuggestRecoveryFlowPrep = (ctx, dailyState) => {
  const { recovery, recoveryFlowDone } = ctx

  if (!hasTrainingToday(ctx, dailyState) || recoveryFlowDone) {
    return false
  }

  return (
    recovery.workoutsThisWeek >= 2 && recovery.recoveryFlowsThisWeek === 0
  )
}

export const shouldSuggestMorningMovement = (ctx, dailyState) => {
  const { readiness, mobilityResetDone } = ctx

  if (!hasTrainingToday(ctx, dailyState) || mobilityResetDone) {
    return false
  }

  const concernFactors = (readiness.factors ?? []).filter(
    (factor) => factor.concern,
  )
  const loadAdjusted =
    dailyState === DAILY_STATE.MANAGE_LOAD ||
    dailyState === DAILY_STATE.READY_WITH_ADJUSTMENT

  return loadAdjusted || concernFactors.length > 0
}

const weeklyCheckInActionable = (ctx) => {
  if (ctx.weeklyCheckInRequired !== true) return false
  const weekly = ctx.weeklyCheckInState
  return Boolean(weekly?.due && !weekly?.loading && weekly?.status !== 'loading')
}

export const selectPrimaryAvaAction = (ctx, dailyState) => {
  const {
    state,
    readiness,
    workoutContext,
    assignmentDueToday: assignment,
    hasHistory,
  } = ctx

  const workoutName = resolveTodayWorkoutName(ctx)
  const formattedWorkout = formatWorkoutName(workoutName)

  if (state.activeWorkout?.name) {
    return buildAction({
      type: AVA_ACTION_TYPES.CONTINUE_WORKOUT,
      focusAction: FOCUS_ACTIONS.CONTINUE_WORKOUT,
      eyebrow: 'IN PROGRESS',
      label: `Continue ${formatWorkoutName(state.activeWorkout.name) ?? 'Workout'}`,
      detail: null,
      meta: { workoutName: state.activeWorkout.name },
    })
  }

  if (
    dailyState === DAILY_STATE.REST &&
    !assignment &&
    !state.activeWorkout
  ) {
    return buildAction({
      type: AVA_ACTION_TYPES.REST,
      focusAction: FOCUS_ACTIONS.VIEW_TODAY,
      eyebrow: null,
      label: null,
      detail: null,
      meta: {},
    })
  }

  if (weeklyCheckInActionable(ctx) && readiness.completed) {
    return buildAction({
      type: AVA_ACTION_TYPES.OPEN_WEEKLY_CHECKIN,
      focusAction: FOCUS_ACTIONS.VIEW_TODAY,
      eyebrow: 'WEEKLY CHECK-IN',
      label: 'Complete Weekly Check-In',
      detail: null,
      meta: {
        weekKey: ctx.weeklyCheckInState?.weekKey ?? null,
      },
    })
  }

  if (!readiness.completed) {
    if (!hasHistory) {
      return buildAction({
        type: AVA_ACTION_TYPES.BUILD_BASELINE,
        focusAction: FOCUS_ACTIONS.CHECK_IN,
        eyebrow: 'DAILY READINESS',
        label: "Complete Today's Readiness",
        detail: null,
        meta: {},
      })
    }

    return buildAction({
      type: AVA_ACTION_TYPES.CHECK_READINESS,
      focusAction: FOCUS_ACTIONS.CHECK_IN,
      eyebrow: 'DAILY READINESS',
      label: "Complete Today's Readiness",
      detail: null,
      meta: {},
    })
  }

  if (dailyState === DAILY_STATE.RECOVERY_PRIORITY) {
    return buildAction({
      type: AVA_ACTION_TYPES.RECOVERY_FLOW,
      focusAction: FOCUS_ACTIONS.BEGIN_RECOVERY,
      eyebrow: 'RECOVERY',
      label: 'Start Recovery Flow',
      detail: null,
      meta: { flowId: 'recovery-flow' },
    })
  }

  if (shouldSuggestRecoveryFlowPrep(ctx, dailyState)) {
    return buildAction({
      type: AVA_ACTION_TYPES.RECOVERY_FLOW,
      focusAction: FOCUS_ACTIONS.BEGIN_RECOVERY,
      eyebrow: 'RECOVERY',
      label: 'Start Recovery Flow',
      detail: null,
      meta: { flowId: 'recovery-flow' },
    })
  }

  if (shouldSuggestMorningMovement(ctx, dailyState)) {
    return buildAction({
      type: AVA_ACTION_TYPES.MORNING_MOVEMENT,
      focusAction: FOCUS_ACTIONS.BEGIN_RECOVERY,
      eyebrow: 'MOVEMENT',
      label: 'Start Morning Movement',
      detail: null,
      meta: { flowId: 'daily-reset' },
    })
  }

  if (isWorkoutCompleteToday(ctx) && !workoutName) {
    const completedName = formatWorkoutName(
      ctx.workoutRecommendation?.completedWorkoutName ??
        ctx.workoutContext?.completedWorkoutName,
    )
    const nextName = formatWorkoutName(ctx.workoutRecommendation?.nextWorkout)
    const detail =
      completedName && nextName
        ? `${completedName} · Today. Next: ${nextName} · Tomorrow`
        : completedName
          ? `${completedName} · Today`
          : null

    return buildAction({
      type: AVA_ACTION_TYPES.VIEW_PLAN,
      focusAction: FOCUS_ACTIONS.VIEW_TODAY,
      eyebrow: 'WORKOUT COMPLETE',
      label: null,
      detail,
      meta: {},
    })
  }

  if (workoutName && dailyState !== DAILY_STATE.REST) {
    const coachAssigned = Boolean(assignment || workoutContext?.coachAssigned)

    return buildAction({
      type: AVA_ACTION_TYPES.START_WORKOUT,
      focusAction: FOCUS_ACTIONS.START_WORKOUT,
      eyebrow: coachAssigned ? 'YOUR COACH\u2019S SESSION' : null,
      label: `Start ${formattedWorkout}`,
      detail: null,
      meta: {
        workoutName,
        assignmentId: assignment?.id ?? workoutContext?.assignmentId ?? null,
      },
    })
  }

  if (!hasHistory) {
    return buildAction({
      type: AVA_ACTION_TYPES.BUILD_BASELINE,
      focusAction: FOCUS_ACTIONS.CHECK_IN,
      eyebrow: 'DAILY READINESS',
      label: "Complete Today's Readiness",
      detail: null,
      meta: {},
    })
  }

  return buildAction({
    type: AVA_ACTION_TYPES.VIEW_PLAN,
    focusAction: FOCUS_ACTIONS.VIEW_TODAY,
    eyebrow: null,
    label: 'View Today\u2019s Plan',
    detail: null,
    meta: {},
  })
}

export const selectSecondaryAvaAction = (ctx, dailyState, primaryAction) => {
  if (!primaryAction?.type) return null

  const { hasHistory, readiness } = ctx

  const workoutName = resolveTodayWorkoutName(ctx)
  const formattedWorkout = formatWorkoutName(workoutName)

  if (isWorkoutCompleteToday(ctx) && !workoutName) {
    if (
      primaryAction.type === AVA_ACTION_TYPES.RECOVERY_FLOW ||
      primaryAction.type === AVA_ACTION_TYPES.MORNING_MOVEMENT
    ) {
      return null
    }

    if (ctx.workoutRecommendation?.canStartAnotherToday) {
      return buildAction({
        type: AVA_ACTION_TYPES.VIEW_PLAN,
        focusAction: FOCUS_ACTIONS.VIEW_TODAY,
        eyebrow: null,
        label: 'Choose another workout',
        detail: null,
        meta: {},
      })
    }

    return null
  }

  if (
    (primaryAction.type === AVA_ACTION_TYPES.MORNING_MOVEMENT ||
      primaryAction.type === AVA_ACTION_TYPES.RECOVERY_FLOW) &&
    workoutName &&
    dailyState !== DAILY_STATE.REST
  ) {
    return buildAction({
      type: AVA_ACTION_TYPES.START_WORKOUT,
      focusAction: FOCUS_ACTIONS.START_WORKOUT,
      eyebrow: null,
      label: `Start ${formattedWorkout}`,
      detail: null,
      meta: {
        workoutName,
        assignmentId: primaryAction.meta?.assignmentId ?? null,
      },
    })
  }

  if (
    primaryAction.type === AVA_ACTION_TYPES.START_WORKOUT &&
    shouldSuggestMorningMovement(ctx, dailyState)
  ) {
    return buildAction({
      type: AVA_ACTION_TYPES.MORNING_MOVEMENT,
      focusAction: FOCUS_ACTIONS.BEGIN_RECOVERY,
      eyebrow: null,
      label: 'Morning Movement',
      detail: null,
      meta: { flowId: 'daily-reset' },
    })
  }

  if (
    primaryAction.type === AVA_ACTION_TYPES.CHECK_READINESS &&
    weeklyCheckInActionable(ctx)
  ) {
    return buildAction({
      type: AVA_ACTION_TYPES.OPEN_WEEKLY_CHECKIN,
      focusAction: FOCUS_ACTIONS.VIEW_TODAY,
      eyebrow: null,
      label: 'Complete Weekly Check-In',
      detail: null,
      meta: {
        weekKey: ctx.weeklyCheckInState?.weekKey ?? null,
      },
    })
  }

  if (
    primaryAction.type === AVA_ACTION_TYPES.CHECK_READINESS &&
    hasHistory &&
    workoutName
  ) {
    return buildAction({
      type: AVA_ACTION_TYPES.START_WORKOUT,
      focusAction: FOCUS_ACTIONS.START_WORKOUT,
      eyebrow: null,
      label: `Start ${formattedWorkout}`,
      detail: null,
      meta: { workoutName },
    })
  }

  if (
    primaryAction.type === AVA_ACTION_TYPES.BUILD_BASELINE &&
    workoutName &&
    readiness.completed
  ) {
    return buildAction({
      type: AVA_ACTION_TYPES.START_WORKOUT,
      focusAction: FOCUS_ACTIONS.START_WORKOUT,
      eyebrow: null,
      label: `Start ${formattedWorkout}`,
      detail: null,
      meta: { workoutName },
    })
  }

  return null
}

const watchConflictsWithPrimary = (item, primaryAction) => {
  if (!item || !primaryAction) return false

  if (
    item.kind === 'recovery-flow' &&
    (primaryAction.type === AVA_ACTION_TYPES.RECOVERY_FLOW ||
      primaryAction.type === AVA_ACTION_TYPES.MORNING_MOVEMENT)
  ) {
    return true
  }

  if (
    item.kind === 'readiness-trend' &&
    primaryAction.type === AVA_ACTION_TYPES.CHECK_READINESS
  ) {
    return true
  }

  return false
}

export const selectAvaWatchItem = (watchItems = [], primaryAction) => {
  const candidate = watchItems.find(
    (item) => !watchConflictsWithPrimary(item, primaryAction),
  )
  return candidate ?? null
}

export const buildAvaDailyAction = (ctx, dailyState, watchItems = []) => {
  const primaryAction = selectPrimaryAvaAction(ctx, dailyState)
  const secondaryAction = selectSecondaryAvaAction(
    ctx,
    dailyState,
    primaryAction,
  )
  const watchItem = selectAvaWatchItem(watchItems, primaryAction)

  return {
    primaryAction,
    secondaryAction,
    watchItem,
  }
}
