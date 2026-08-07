import { analyticsSnapshot } from './analytics'
import { calculateReadiness } from './readiness'
import { buildTrainingRecommendation, TRAINING_RECOMMENDATIONS } from './trainingRecommendations'
import { calculateRecoveryIntelligence } from '../data/mobility'
import { nutritionDateKey, nutritionTotals } from './nutrition'
import {
  resolveActiveCoachAssignment,
  assignmentDueToday,
} from './coachAssignments'
import { resolveTodayWorkoutContext } from './todayWorkout'

const DAY_MS = 86400000

export const FOCUS_TYPES = {
  TRAIN: 'train',
  RECOVER: 'recover',
  REST: 'rest',
  NUTRITION: 'nutrition',
  CONSISTENCY: 'consistency',
}

export const FOCUS_ACTIONS = {
  START_WORKOUT: 'start-workout',
  CONTINUE_WORKOUT: 'continue-workout',
  BEGIN_RECOVERY: 'begin-recovery',
  LOG_FOOD: 'log-food',
  CHECK_IN: 'check-in',
  VIEW_TODAY: 'view-today',
}

export const FOCUS_ACTION_LABELS = {
  [FOCUS_ACTIONS.START_WORKOUT]: 'Start Workout',
  [FOCUS_ACTIONS.CONTINUE_WORKOUT]: 'Continue Workout',
  [FOCUS_ACTIONS.BEGIN_RECOVERY]: 'Begin Recovery',
  [FOCUS_ACTIONS.LOG_FOOD]: 'Log Food',
  [FOCUS_ACTIONS.CHECK_IN]: 'Check In',
  [FOCUS_ACTIONS.VIEW_TODAY]: 'View Today',
}

const todayKey = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 10)

const sessionDate = (session) =>
  session?.finishedAt ??
  (session?.date ? `${session.date}T12:00:00` : null)

const daysSince = (value, now = new Date()) => {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return Math.max(
    0,
    Math.floor((now.getTime() - time) / DAY_MS),
  )
}

const lastWorkoutSession = (history = []) =>
  [...history]
    .filter((session) => sessionDate(session))
    .sort((a, b) =>
      String(sessionDate(a)).localeCompare(String(sessionDate(b))),
    )
    .at(-1) ?? null

const getPlannedWorkout = (state = {}, context = {}) =>
  resolveTodayWorkoutContext(state, context).name

const isScheduledRestDay = (state = {}, context = {}) => {
  const now = context.now ?? new Date()
  return state.weeklySchedule?.[now.getDay()] === 'Rest'
}

const nutritionDaySummary = (state = {}, now = new Date()) => {
  const day = state.nutrition?.days?.[nutritionDateKey(now)]
  const totals = nutritionTotals(day)
  const goal = Number(state.nutrition?.goals?.calories ?? 2200)

  return {
    calories: Math.round(totals.calories),
    goal,
    protein: Math.round(totals.protein),
    proteinGoal: Number(state.nutrition?.goals?.protein ?? 170),
    progress: goal > 0 ? totals.calories / goal : 0,
  }
}

const isNutritionFocusAppropriate = (
  summary,
  now = new Date(),
) => {
  const hour = now.getHours()
  if (hour < 14) return false
  if (summary.progress >= 0.35) return false
  return summary.calories >= 0
}

const buildFocus = ({
  type,
  title,
  explanation,
  action,
  reasons = [],
  meta = {},
}) => ({
  type,
  title,
  explanation,
  action,
  actionLabel: FOCUS_ACTION_LABELS[action],
  reasons,
  meta,
  generatedAt: new Date().toISOString(),
})

/**
 * Derives one primary daily focus from existing athlete data.
 *
 * Priority order (first match wins):
 * 1. Active workout in progress → Train / Continue Workout
 * 2. Coach assignment due today → Train / Start Workout
 * 3. New athlete (no workout history) → Consistency / Check In
 * 4. Missing today’s readiness check-in → Consistency / Check In
 * 5. Low readiness (recovery-day recommendation) → Recover / Begin Recovery
 * 6. Scheduled rest day → Rest / View Today
 * 7. Recovery habits behind recent training → Recover / Begin Recovery
 * 8. Extended inactivity (5+ days) → Consistency / Start Workout
 * 9. Nutrition logging lag (afternoon, low intake) → Nutrition / Log Food
 * 10. Default planned training → Train / Start Workout
 * 11. Fallback (no clear plan) → Consistency / View Today
 */
export const deriveTodaysFocus = (
  state = {},
  context = {},
) => {
  const now = context.now ?? new Date()
  const history = state.history ?? []
  const readiness = calculateReadiness(state)
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
  const plannedWorkout = workoutContext.name
  const trainingRecommendation = buildTrainingRecommendation(
    state,
    plannedWorkout,
  )
  const nutrition = nutritionDaySummary(state, now)
  const hasHistory = history.length > 0

  if (state.activeWorkout) {
    return buildFocus({
      type: FOCUS_TYPES.TRAIN,
      title: state.activeWorkout.name,
      explanation:
        'Your session is already in progress. Pick up where you left off.',
      action: FOCUS_ACTIONS.CONTINUE_WORKOUT,
      reasons: [
        'An active workout is saved in progress.',
        'Continuing keeps your set history intact.',
      ],
      meta: { workoutName: state.activeWorkout.name },
    })
  }

  if (assignmentDueTodayItem) {
    return buildFocus({
      type: FOCUS_TYPES.TRAIN,
      title: assignmentDueTodayItem.title || 'Assigned workout',
      explanation:
        assignmentDueTodayItem.coach_notes ||
        assignmentDueTodayItem.notes ||
        'Your coach assigned this session for today.',
      action: FOCUS_ACTIONS.START_WORKOUT,
      reasons: [
        'A coached assignment is active.',
        assignmentDueTodayItem.title
          ? `Assignment: ${assignmentDueTodayItem.title}`
          : 'Coach-assigned session',
      ],
      meta: { assignmentId: assignmentDueTodayItem.id },
    })
  }

  if (!hasHistory) {
    return buildFocus({
      type: FOCUS_TYPES.CONSISTENCY,
      title: 'Start with a check-in',
      explanation:
        'Complete a quick readiness check-in so AVAREN can learn what your day needs.',
      action: FOCUS_ACTIONS.CHECK_IN,
      reasons: [
        'No workout history saved yet.',
        'Readiness ratings personalize today’s guidance.',
      ],
    })
  }

  if (!readiness.completed) {
    return buildFocus({
      type: FOCUS_TYPES.CONSISTENCY,
      title: 'Check in for today',
      explanation:
        'Rate sleep, energy, soreness, and stress before choosing how hard to push.',
      action: FOCUS_ACTIONS.CHECK_IN,
      reasons: [
        'Today’s readiness check-in is not complete.',
        trainingRecommendation.summary ||
          'A check-in improves training guidance.',
      ],
    })
  }

  if (
    trainingRecommendation.id ===
    TRAINING_RECOMMENDATIONS.RECOVERY_DAY
  ) {
    return buildFocus({
      type: FOCUS_TYPES.RECOVER,
      title: 'Prioritize recovery today',
      explanation: trainingRecommendation.summary,
      action: FOCUS_ACTIONS.BEGIN_RECOVERY,
      reasons: [
        `Readiness score ${readiness.score}`,
        ...(trainingRecommendation.evidence ?? []).slice(0, 3),
        readiness.recommendation,
      ],
      meta: { readinessScore: readiness.score },
    })
  }

  if (isScheduledRestDay(state, { now, assignmentDueToday: assignmentDueTodayItem })) {
    return buildFocus({
      type: FOCUS_TYPES.REST,
      title: 'Recovery day on your plan',
      explanation:
        'Your schedule calls for rest today. Mobility, nutrition, and light movement still count.',
      action: FOCUS_ACTIONS.VIEW_TODAY,
      reasons: [
        'Today is marked as a rest day on your weekly schedule.',
        recovery.insight,
      ],
    })
  }

  if (
    recovery.workoutsThisWeek >= 2 &&
    recovery.recoveryFlowsThisWeek === 0
  ) {
    return buildFocus({
      type: FOCUS_TYPES.RECOVER,
      title: 'Balance training with recovery',
      explanation: recovery.insight,
      action: FOCUS_ACTIONS.BEGIN_RECOVERY,
      reasons: [
        `${recovery.workoutsThisWeek} workouts logged this week`,
        'No Recovery Flow completed this week',
        `Recovery score ${recovery.score}`,
      ],
    })
  }

  const lastSession = lastWorkoutSession(history)
  const daysSinceLastWorkout = lastSession
    ? daysSince(sessionDate(lastSession), now)
    : null

  if (daysSinceLastWorkout !== null && daysSinceLastWorkout >= 5) {
    return buildFocus({
      type: FOCUS_TYPES.CONSISTENCY,
      title: 'Rebuild your rhythm',
      explanation: `It has been ${daysSinceLastWorkout} days since your last workout. A short session can restore momentum.`,
      action: FOCUS_ACTIONS.START_WORKOUT,
      reasons: [
        `Last workout: ${lastSession.name}`,
        `${daysSinceLastWorkout} days since your last session`,
        analytics.currentStreak
          ? `Current streak: ${analytics.currentStreak} days`
          : 'No active training streak',
      ],
      meta: { daysSinceLastWorkout },
    })
  }

  if (isNutritionFocusAppropriate(nutrition, now)) {
    return buildFocus({
      type: FOCUS_TYPES.NUTRITION,
      title: 'Catch up on nutrition',
      explanation: `${nutrition.calories} of ${nutrition.goal} calories logged so far today. A quick log keeps your day on track.`,
      action: FOCUS_ACTIONS.LOG_FOOD,
      reasons: [
        `${nutrition.calories} calories logged`,
        `${Math.round(nutrition.progress * 100)}% of calorie goal`,
        `${nutrition.protein}g protein logged`,
      ],
      meta: { nutrition },
    })
  }

  if (plannedWorkout) {
    return buildFocus({
      type: FOCUS_TYPES.TRAIN,
      title: plannedWorkout,
      explanation:
        trainingRecommendation.summary ||
        'Your planned session is ready when you are.',
      action: FOCUS_ACTIONS.START_WORKOUT,
      reasons: [
        `Planned workout: ${plannedWorkout}`,
        `Readiness ${readiness.score} · ${readiness.status}`,
        ...(trainingRecommendation.evidence ?? []).slice(0, 2),
      ],
      meta: { workoutName: plannedWorkout },
    })
  }

  return buildFocus({
    type: FOCUS_TYPES.CONSISTENCY,
    title: 'Review today’s plan',
    explanation:
      'No workout is scheduled yet. Review your week and choose the next step that fits.',
    action: FOCUS_ACTIONS.VIEW_TODAY,
    reasons: [
      'No planned workout selected for today.',
      'Weekly schedule and assignments are available below.',
    ],
  })
}

export { assignmentDueToday } from './coachAssignments'
