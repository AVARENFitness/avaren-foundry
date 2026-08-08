import { analyticsSnapshot } from './analytics'
import { calculateReadiness, readinessTrendSnapshot } from './readiness'
import {
  buildTrainingRecommendation,
  TRAINING_RECOMMENDATIONS,
} from './trainingRecommendations'
import { calculateRecoveryIntelligence } from '../data/mobility'
import { nutritionDateKey, nutritionTotals } from './nutrition'
import { recentPRs, selectAvaPerformanceWin } from './metrics'
import {
  resolveActiveCoachAssignment,
  assignmentDueToday,
} from './coachAssignments'
import {
  deriveTodaysFocus,
  FOCUS_ACTIONS,
} from './todaysFocus'
import { resolveTodayWorkoutContext } from './todayWorkout'
import { applyAvaVoice } from './avaVoice'
import { buildAvaDailyAction } from './avaActions'

const DAY_MS = 86400000

export const AVA_DAILY_STATES = {
  READY: 'ready',
  READY_WITH_ADJUSTMENT: 'ready-with-adjustment',
  MANAGE_LOAD: 'manage-load',
  RECOVERY_PRIORITY: 'recovery-priority',
  REST: 'rest',
  INSUFFICIENT_DATA: 'insufficient-data',
}

export const AVA_RECOMMENDATIONS = {
  TRAIN_AS_PLANNED: 'train-as-planned',
  TRAIN_WITH_MODIFICATION: 'train-with-modification',
  LOWER_TRAINING_STRESS: 'lower-training-stress',
  RECOVERY_MOBILITY_PRIORITY: 'recovery-mobility-priority',
  REST_DAY: 'rest-day',
  NEED_MORE_DATA: 'need-more-data',
}

export const AVA_CONFIDENCE = {
  STRONG: 'strong',
  MODERATE: 'moderate',
  LIMITED: 'limited',
}

export const AVA_STATE_HEADLINES = {
  [AVA_DAILY_STATES.READY]: "You're ready to train.",
  [AVA_DAILY_STATES.READY_WITH_ADJUSTMENT]:
    'Train today — with a small adjustment.',
  [AVA_DAILY_STATES.MANAGE_LOAD]: 'Manage training load today.',
  [AVA_DAILY_STATES.RECOVERY_PRIORITY]: 'Recovery takes priority today.',
  [AVA_DAILY_STATES.REST]: 'Rest day on your plan.',
  [AVA_DAILY_STATES.INSUFFICIENT_DATA]: 'Build your baseline.',
}

const sessionDate = (session) =>
  session?.finishedAt ??
  (session?.date ? `${session.date}T12:00:00` : null)

const daysSince = (value, now = new Date()) => {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((now.getTime() - time) / DAY_MS))
}

const isScheduledRestDay = (workoutContext) =>
  Boolean(workoutContext?.isRestDay)

const nutritionDaySummary = (state = {}, now = new Date()) => {
  const day = state.nutrition?.days?.[nutritionDateKey(now)]
  const totals = nutritionTotals(day)
  const goal = Number(state.nutrition?.goals?.calories ?? 2200)
  const proteinGoal = Number(state.nutrition?.goals?.protein ?? 170)

  return {
    calories: Math.round(totals.calories),
    goal,
    protein: Math.round(totals.protein),
    proteinGoal,
    progress: goal > 0 ? totals.calories / goal : 0,
    proteinProgress: proteinGoal > 0 ? totals.protein / proteinGoal : 0,
    hasLoggedFood: (day?.foods?.length ?? 0) > 0,
  }
}

const recentSessions = (history = [], days = 7, now = new Date()) =>
  history.filter((session) => {
    const value = sessionDate(session)
    const time = new Date(value).getTime()
    return Number.isFinite(time) && now.getTime() - time <= days * DAY_MS
  })

const lastWorkoutSession = (history = []) =>
  [...history]
    .filter((session) => sessionDate(session))
    .sort((a, b) =>
      String(sessionDate(a)).localeCompare(String(sessionDate(b))),
    )
    .at(-1) ?? null

const mobilityCompletedToday = (state = {}, flowId, date = new Date()) => {
  const today = date.toISOString().slice(0, 10)
  return (state.mobility?.completed ?? []).some((item) => {
    const date = String(item?.completedAt ?? '').slice(0, 10)
    return date === today && (!flowId || item?.flowId === flowId)
  })
}

export const buildAvaContext = (state = {}, context = {}) => {
  const now = context.now ?? new Date()
  const history = (state.history ?? []).filter((session) =>
    Array.isArray(session?.sets),
  )
  const readiness = calculateReadiness(state, now)
  const sevenDay = readinessTrendSnapshot(state, 7)
  const recovery = calculateRecoveryIntelligence(state)
  const analytics = analyticsSnapshot(state)
  const assignmentDueTodayItem =
    context.activeCoachAssignment ??
    resolveActiveCoachAssignment(context.assignments ?? [], now) ??
    context.assignmentDueToday ??
    null
  const workoutContext = resolveTodayWorkoutContext(state, {
    now,
    assignments: context.assignments,
    activeCoachAssignment: assignmentDueTodayItem,
  })
  const nutrition = nutritionDaySummary(state, now)
  const trainingRecommendation = buildTrainingRecommendation(
    state,
    workoutContext.name,
    now,
  )
  const todaysFocus = deriveTodaysFocus(state, {
    now,
    assignmentDueToday: assignmentDueTodayItem,
  })

  return {
    state,
    now,
    history,
    readiness,
    sevenDay,
    recovery,
    analytics,
    workoutContext,
    trainingRecommendation,
    assignmentDueToday: assignmentDueTodayItem,
    nutrition,
    todaysFocus,
    workoutContext,
    hasHistory: history.length > 0,
    isRestDay: isScheduledRestDay(workoutContext),
    recentWorkouts: recentSessions(history, 7, now),
    lastSession: lastWorkoutSession(history),
    mobilityResetDone: mobilityCompletedToday(state, 'daily-reset', now),
    recoveryFlowDone: mobilityCompletedToday(state, 'recovery-flow', now),
  }
}

export const buildAvaConfidence = (ctx) => {
  const signals = []

  if (ctx.readiness.completed) signals.push('readiness')
  if (ctx.hasHistory) signals.push('history')
  if (ctx.sevenDay.count >= 3) signals.push('readiness-trend')
  if (ctx.recentWorkouts.length >= 2) signals.push('recent-training')

  if (signals.length >= 3) {
    return {
      level: AVA_CONFIDENCE.STRONG,
      note: null,
    }
  }

  if (signals.length >= 1) {
    return {
      level: AVA_CONFIDENCE.MODERATE,
      note:
        signals.length < 2
          ? 'AVA is still learning your training pattern.'
          : null,
    }
  }

  return {
    level: AVA_CONFIDENCE.LIMITED,
    note: 'AVA is still learning your training pattern.',
  }
}

export const buildAvaDailyState = (ctx) => {
  const { trainingRecommendation, readiness, hasHistory, isRestDay } = ctx

  if (
    isRestDay &&
    !ctx.assignmentDueToday &&
    !ctx.state.activeWorkout
  ) {
    return AVA_DAILY_STATES.REST
  }

  if (!hasHistory && !readiness.completed) {
    return AVA_DAILY_STATES.INSUFFICIENT_DATA
  }

  if (!readiness.completed && hasHistory) {
    return AVA_DAILY_STATES.INSUFFICIENT_DATA
  }

  if (
    trainingRecommendation.id === TRAINING_RECOMMENDATIONS.RECOVERY_DAY
  ) {
    return AVA_DAILY_STATES.RECOVERY_PRIORITY
  }

  if (
    trainingRecommendation.id ===
      TRAINING_RECOMMENDATIONS.REDUCE_VOLUME ||
    trainingRecommendation.id ===
      TRAINING_RECOMMENDATIONS.REDUCE_INTENSITY
  ) {
    return AVA_DAILY_STATES.MANAGE_LOAD
  }

  if (
    trainingRecommendation.id === TRAINING_RECOMMENDATIONS.CHANGE_FOCUS
  ) {
    return AVA_DAILY_STATES.READY_WITH_ADJUSTMENT
  }

  if (
    trainingRecommendation.id === TRAINING_RECOMMENDATIONS.CHECK_IN
  ) {
    return AVA_DAILY_STATES.INSUFFICIENT_DATA
  }

  return AVA_DAILY_STATES.READY
}

export const buildAvaTrainingRecommendation = (ctx, dailyState) => {
  const { trainingRecommendation, todaysFocus } = ctx

  const map = {
    [AVA_DAILY_STATES.INSUFFICIENT_DATA]: AVA_RECOMMENDATIONS.NEED_MORE_DATA,
    [AVA_DAILY_STATES.REST]: AVA_RECOMMENDATIONS.REST_DAY,
    [AVA_DAILY_STATES.RECOVERY_PRIORITY]:
      AVA_RECOMMENDATIONS.RECOVERY_MOBILITY_PRIORITY,
    [AVA_DAILY_STATES.MANAGE_LOAD]:
      AVA_RECOMMENDATIONS.LOWER_TRAINING_STRESS,
    [AVA_DAILY_STATES.READY_WITH_ADJUSTMENT]:
      AVA_RECOMMENDATIONS.TRAIN_WITH_MODIFICATION,
    [AVA_DAILY_STATES.READY]: AVA_RECOMMENDATIONS.TRAIN_AS_PLANNED,
  }

  const labels = {
    [AVA_RECOMMENDATIONS.TRAIN_AS_PLANNED]: 'Train as planned',
    [AVA_RECOMMENDATIONS.TRAIN_WITH_MODIFICATION]: 'Train with modification',
    [AVA_RECOMMENDATIONS.LOWER_TRAINING_STRESS]: 'Lower training stress',
    [AVA_RECOMMENDATIONS.RECOVERY_MOBILITY_PRIORITY]:
      'Recovery / mobility priority',
    [AVA_RECOMMENDATIONS.REST_DAY]: 'Rest day',
    [AVA_RECOMMENDATIONS.NEED_MORE_DATA]: 'Need more data',
  }

  const id = map[dailyState] ?? AVA_RECOMMENDATIONS.NEED_MORE_DATA

  return {
    id,
    label: labels[id],
    summary: trainingRecommendation.summary,
    action: todaysFocus.action,
    actionLabel: todaysFocus.actionLabel,
  }
}

export const buildAvaFocus = (ctx, dailyState) => {
  const {
    todaysFocus,
    assignmentDueToday: assignment,
    workoutContext,
    readiness,
    recovery,
    lastSession,
    now,
  } = ctx
  const workoutName = workoutContext?.displayName ?? null

  if (dailyState === AVA_DAILY_STATES.INSUFFICIENT_DATA) {
    return {
      kind: 'low-data',
      title: 'Complete a few check-ins and workouts',
      detail:
        'Readiness and training history help AVA identify your patterns.',
    }
  }

  if (dailyState === AVA_DAILY_STATES.REST) {
    return {
      kind: 'rest',
      title: 'Honor your rest day',
      detail:
        'Light movement, nutrition, and recovery habits still support progress.',
    }
  }

  if (dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY) {
    return {
      kind: 'recovery',
      title: 'Prioritize recovery habits',
      detail: recovery.insight || todaysFocus.explanation,
    }
  }

  if (assignment && workoutName) {
    return {
      kind: 'coach-workout',
      workoutName,
      title: `Execute ${workoutName}`,
      detail:
        assignment.coach_notes ||
        assignment.title ||
        'Your coach programmed this session for today.',
    }
  }

  if (workoutName) {
    return {
      kind: 'execute-workout',
      workoutName,
      title: `Execute ${workoutName}`,
      detail:
        dailyState === AVA_DAILY_STATES.MANAGE_LOAD
          ? 'Keep the session but manage effort and volume.'
          : dailyState === AVA_DAILY_STATES.READY_WITH_ADJUSTMENT
            ? 'Consider adjusting focus based on recent training.'
            : `Readiness ${readiness.score} supports training as planned.`,
    }
  }

  const daysSinceLastWorkout = lastSession
    ? daysSince(sessionDate(lastSession), now)
    : null

  return {
    kind: 'no-workout',
    daysSinceLastWorkout,
    title: 'No workout is currently scheduled',
    detail: todaysFocus.explanation,
  }
}

export const buildAvaWatchItems = (ctx, dailyState) => {
  const items = []
  const {
    readiness,
    sevenDay,
    recovery,
    nutrition,
    recentWorkouts,
    lastSession,
    now,
  } = ctx

  if (dailyState === AVA_DAILY_STATES.INSUFFICIENT_DATA) {
    return items
  }

  if (
    readiness.completed &&
    sevenDay.average !== null &&
    readiness.score < sevenDay.average - 8
  ) {
    items.push({
      kind: 'readiness-trend',
      title: 'Readiness trending lower',
      detail: `Today ${readiness.score} vs ${Math.round(sevenDay.average)} recent average`,
    })
  }

  const daysSinceLast = lastSession
    ? daysSince(sessionDate(lastSession), now)
    : null

  if (daysSinceLast !== null && daysSinceLast >= 4) {
    items.push({
      kind: 'training-gap',
      title: 'Training gap building',
      detail: `${daysSinceLast} days since your last workout`,
    })
  }

  if (
    recovery.workoutsThisWeek >= 2 &&
    recovery.recoveryFlowsThisWeek === 0
  ) {
    items.push({
      kind: 'recovery-flow',
      title: 'Recovery flow incomplete',
      detail: `${recovery.workoutsThisWeek} workouts this week without a Recovery Flow`,
    })
  }

  if (
    nutrition.hasLoggedFood &&
    nutrition.proteinGoal > 0 &&
    nutrition.proteinProgress < 0.55 &&
    now.getHours() >= 14
  ) {
    items.push({
      kind: 'protein',
      title: 'Protein below target',
      detail: `${nutrition.protein}g of ${nutrition.proteinGoal}g logged today`,
    })
  }

  if (recentWorkouts.length >= 4 && dailyState !== AVA_DAILY_STATES.REST) {
    items.push({
      kind: 'frequency',
      title: 'Recent training frequency elevated',
      detail: `${recentWorkouts.length} sessions in the last 7 days`,
    })
  }

  const concernFactors = (readiness.factors ?? []).filter(
    (factor) => factor.concern,
  )
  if (
    concernFactors.length &&
    dailyState !== AVA_DAILY_STATES.RECOVERY_PRIORITY
  ) {
    const factor = concernFactors[0]
    items.push({
      kind: 'concern-factor',
      title: `${factor.label} needs attention`,
      detail: `${factor.value}/5 in today’s check-in`,
    })
  }

  return items.slice(0, 3)
}

export const buildAvaWins = (ctx) => {
  const { analytics, sevenDay, nutrition, now } = ctx

  const performanceWin = selectAvaPerformanceWin(ctx.history, now)
  if (performanceWin) {
    return {
      title:
        performanceWin.type === 'Estimated 1RM'
          ? `${performanceWin.exercise} estimated 1RM improved`
          : `${performanceWin.exercise} personal record`,
      detail: `${performanceWin.type}: ${performanceWin.value}`,
    }
  }

  if (analytics.currentStreak >= 3) {
    return {
      title: 'Training consistency streak',
      detail: `${analytics.currentStreak}-day workout streak active`,
    }
  }

  if (sevenDay.consistency !== null && sevenDay.consistency >= 75) {
    return {
      title: 'Readiness consistency',
      detail: 'Your recent check-ins show stable recovery patterns',
    }
  }

  if (
    nutrition.hasLoggedFood &&
    nutrition.proteinGoal > 0 &&
    nutrition.proteinProgress >= 0.85
  ) {
    return {
      title: 'Strong protein logging',
      detail: `${nutrition.protein}g logged toward ${nutrition.proteinGoal}g target`,
    }
  }

  if (ctx.recovery.recoveryFlowsThisWeek >= 1 && ctx.recovery.score >= 60) {
    return {
      title: 'Recovery habits on track',
      detail: ctx.recovery.status,
    }
  }

  return null
}

export const buildAvaEvidence = (ctx, dailyState) => {
  const {
    readiness,
    sevenDay,
    recovery,
    analytics,
    trainingRecommendation,
    assignmentDueToday: assignment,
    nutrition,
    recentWorkouts,
    workoutContext,
  } = ctx
  const workoutName = workoutContext?.displayName ?? null

  const evidence = []

  if (readiness.completed) {
    evidence.push({
      category: 'Readiness',
      label: String(readiness.score),
      detail: `${readiness.status}${sevenDay.average !== null ? ` · 7-day avg ${Math.round(sevenDay.average)}` : ''}`,
    })
  } else {
    evidence.push({
      category: 'Readiness',
      label: 'Not logged',
      detail: 'Complete today’s check-in for personalized guidance',
    })
  }

  const sessionCount = recentWorkouts.length
  if (sessionCount > 0) {
    evidence.push({
      category: 'Training',
      label: `${sessionCount} session${sessionCount === 1 ? '' : 's'}`,
      detail: `${sessionCount} completed in the last 7 days`,
    })
  } else if (ctx.hasHistory) {
    evidence.push({
      category: 'Training',
      label: 'No recent sessions',
      detail: 'No workouts logged in the last 7 days',
    })
  }

  evidence.push({
    category: 'Recovery',
    label: recovery.score >= 60 ? 'Stable' : 'Needs balance',
    detail:
      recovery.recoveryFlowsThisWeek > 0
        ? `${recovery.recoveryFlowsThisWeek} Recovery Flow${recovery.recoveryFlowsThisWeek === 1 ? '' : 's'} this week`
        : recovery.insight,
  })

  if (analytics.currentStreak > 0) {
    evidence.push({
      category: 'Performance',
      label: `${analytics.currentStreak}-day streak`,
      detail: 'Recent training consistency supports momentum',
    })
  } else if (ctx.hasHistory) {
    const prs = recentPRs(ctx.history, 3)
    if (prs.length) {
      evidence.push({
        category: 'Performance',
        label: prs[0].exercise,
        detail: `${prs[0].type}: ${prs[0].value}`,
      })
    }
  }

  if (nutrition.hasLoggedFood) {
    evidence.push({
      category: 'Nutrition',
      label: `${nutrition.protein}g protein`,
      detail: `${nutrition.calories} calories logged today`,
    })
  }

  if (assignment) {
    evidence.push({
      category: 'Coach',
      label: assignment.title || 'Assigned session',
      detail:
        dailyState === AVA_DAILY_STATES.MANAGE_LOAD ||
        dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY
          ? 'Coach session scheduled — review effort based on readiness'
          : 'Coach-assigned session scheduled for today',
    })
  } else if (workoutName && dailyState !== AVA_DAILY_STATES.REST) {
    evidence.push({
      category: 'Schedule',
      label: workoutName,
      detail: assignment
        ? 'Coach-assigned canonical workout for today'
        : "Today's canonical workout",
    })
  } else if (
    dailyState !== AVA_DAILY_STATES.REST &&
    !workoutName
  ) {
    evidence.push({
      category: 'Training',
      label: 'No workout scheduled',
      detail: 'No workout is currently scheduled for today',
    })
  }

  return evidence
}

const buildSummary = (ctx, dailyState) => {
  const {
    readiness,
    recovery,
    trainingRecommendation,
    assignmentDueToday: assignment,
    workoutContext,
    isRestDay,
  } = ctx
  const workoutName = workoutContext?.displayName ?? null

  if (dailyState === AVA_DAILY_STATES.INSUFFICIENT_DATA) {
    return 'Complete a few workouts and readiness check-ins so AVAREN can begin identifying your patterns.'
  }

  if (dailyState === AVA_DAILY_STATES.REST) {
    return 'Your schedule calls for rest today. Mobility, nutrition, and light movement still support recovery.'
  }

  if (dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY) {
    return trainingRecommendation.summary
  }

  if (assignment) {
    if (
      dailyState === AVA_DAILY_STATES.MANAGE_LOAD ||
      dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY
    ) {
      return `Your coach-assigned session is scheduled today, but today's readiness is below your recent pattern. Review the session and manage effort accordingly.`
    }
    if (readiness.completed && readiness.score >= 58) {
      return `Your coach-assigned session is scheduled today. Current readiness supports training as planned.`
    }
    return `Your coach-assigned session is scheduled today. ${trainingRecommendation.summary}`
  }

  if (dailyState === AVA_DAILY_STATES.MANAGE_LOAD) {
    return `${trainingRecommendation.summary} Recent load and readiness suggest dialing back today.`
  }

  if (dailyState === AVA_DAILY_STATES.READY_WITH_ADJUSTMENT) {
    return trainingRecommendation.summary
  }

  if (workoutName && !isRestDay) {
    const recoveryLine =
      recovery.score >= 60
        ? 'Recovery is stable and your recent training load is on track.'
        : recovery.insight
    return `${recoveryLine} Today's session (${workoutName}) fits your current readiness.`
  }

  return trainingRecommendation.summary
}

export const buildAvaDailyBriefing = (state = {}, context = {}) => {
  const ctx = buildAvaContext(state, context)
  const confidence = buildAvaConfidence(ctx)
  const dailyState = buildAvaDailyState(ctx)
  const recommendation = buildAvaTrainingRecommendation(ctx, dailyState)
  const focusFacts = buildAvaFocus(ctx, dailyState)
  const watchCandidates = buildAvaWatchItems(ctx, dailyState)
  const actions = buildAvaDailyAction(ctx, dailyState, watchCandidates)
  const win = buildAvaWins(ctx)
  const evidence = buildAvaEvidence(ctx, dailyState)

  const factual = {
    dailyState,
    headline:
      AVA_STATE_HEADLINES[dailyState] ??
      AVA_STATE_HEADLINES[AVA_DAILY_STATES.INSUFFICIENT_DATA],
    summary: buildSummary(ctx, dailyState),
    recommendation,
    focus: focusFacts,
    focusFacts,
    primaryAction: actions.primaryAction,
    secondaryAction: actions.secondaryAction,
    watchItem: actions.watchItem,
    watch: actions.watchItem ? [actions.watchItem] : [],
    evidence,
    confidence: confidence.level,
    confidenceNote: confidence.note,
    isLowData: dailyState === AVA_DAILY_STATES.INSUFFICIENT_DATA,
    workout: ctx.workoutContext,
    daysSinceLastWorkout: focusFacts.daysSinceLastWorkout ?? null,
    generatedAt: ctx.now.toISOString(),
  }

  return applyAvaVoice(factual, {
    userName: context.userName,
    now: ctx.now,
  })
}

export { FOCUS_ACTIONS }
export { assignmentDueToday } from './coachAssignments'
