import { analyticsSnapshot } from './analytics'
import {
  buildAvaContext,
  buildAvaDailyBriefing,
  buildAvaEvidence,
} from './avaIntelligence'
import { resolveActiveCoachAssignment } from './coachAssignments'
import { buildPlanningOwnership } from './planOwnership'
import { resolveTodayWorkoutContext } from './todayWorkout'
import {
  executionPlanSummaryLabel,
  isExecutionPlanCurrent,
} from './sessionExecutionPlan'
import { selectAvaPerformanceWin } from './metrics'
import { nutritionDateKey, nutritionTotals } from './nutrition'
import { extractFirstName } from './avaVoice'

const DAY_MS = 86400000

const sessionDate = (session) =>
  session?.finishedAt ??
  (session?.date ? `${session.date}T12:00:00` : null)

const formatWorkoutName = (name) => {
  if (!name) return null
  return String(name).replace(/\s*\+\s*/g, ' & ')
}

const daypart = (now = new Date()) => {
  const hour = now.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

const recentSessions = (history = [], days = 7, now = new Date()) =>
  history.filter((session) => {
    const value = sessionDate(session)
    const time = new Date(value).getTime()
    return Number.isFinite(time) && now.getTime() - time <= days * DAY_MS
  })

const lastSessionForMuscle = (history = [], term = '') => {
  const needle = String(term).trim().toLowerCase()
  if (!needle) return null

  return [...history]
    .filter((session) =>
      (session.sets ?? []).some((set) => {
        const exercise = String(set.exercise ?? '').toLowerCase()
        const muscle = String(set.muscle ?? '').toLowerCase()
        return exercise.includes(needle) || muscle.includes(needle)
      }),
    )
    .sort((a, b) =>
      String(sessionDate(a)).localeCompare(String(sessionDate(b))),
    )
    .at(-1) ?? null
}

const resolveWorkoutExercises = (state = {}, workoutName, assignment = null) => {
  if (assignment?.workout_payload?.exercises?.length) {
    return assignment.workout_payload.exercises.map((item) => ({
      name: item.name ?? item.exercise ?? 'Exercise',
      sets: item.sets ?? null,
      muscle: item.muscle ?? null,
    }))
  }

  const programExercises = state.program?.workouts?.[workoutName]
  if (Array.isArray(programExercises) && programExercises.length) {
    return programExercises.map((item) => ({
      name: item.name ?? item.exercise ?? 'Exercise',
      sets: item.sets ?? null,
      muscle: item.muscle ?? null,
    }))
  }

  return []
}

const sanitizeAssignment = (assignment) => {
  if (!assignment) return null

  return {
    id: assignment.id,
    title: assignment.title ?? null,
    status: assignment.status ?? null,
    dueDate:
      assignment.due_date ??
      assignment.scheduled_date ??
      null,
    workoutName:
      assignment.workout_payload?.name ??
      assignment.title ??
      null,
    athleteNotes: assignment.coach_notes ?? assignment.notes ?? null,
    exercises: (assignment.workout_payload?.exercises ?? []).map((item) => ({
      name: item.name ?? item.exercise ?? 'Exercise',
      sets: item.sets ?? null,
      muscle: item.muscle ?? null,
    })),
  }
}

export const buildAvaContextPacket = (state = {}, options = {}) => {
  const now = options.now ?? new Date()
  const assignments = options.assignments ?? []
  const activeCoachAssignment =
    options.activeCoachAssignment ??
    resolveActiveCoachAssignment(assignments, now) ??
    null

  const ctx = buildAvaContext(state, {
    ...options,
    now,
    assignments,
    activeCoachAssignment,
  })
  const briefing = buildAvaDailyBriefing(state, {
    ...options,
    now,
    assignments,
    activeCoachAssignment,
  })
  const evidence = buildAvaEvidence(ctx, briefing.dailyState)
  const analytics = analyticsSnapshot(state)
  const history = (state.history ?? []).filter((session) =>
    Array.isArray(session?.sets),
  )
  const recentWorkouts = recentSessions(history, 7, now)
  const performanceWin = selectAvaPerformanceWin(history, now)
  const workoutName = briefing.workout?.displayName ?? null
  const todayWorkout = resolveTodayWorkoutContext(state, {
    now,
    assignments,
    activeCoachAssignment,
  })
  const planningOwnership = buildPlanningOwnership({
    todayWorkout,
    activeAssignment: activeCoachAssignment,
    hasCoachRelationship: Boolean(assignments.length),
  })
  const executionFocusLabel = isExecutionPlanCurrent(state.sessionExecutionPlan)
    ? executionPlanSummaryLabel(state.sessionExecutionPlan)
    : null
  const nutritionDay = state.nutrition?.days?.[nutritionDateKey(now)] ?? null
  const nutritionTotalsToday = nutritionTotals(nutritionDay)
  const proteinGoal = Number(state.nutrition?.goals?.protein ?? 170)
  const calorieGoal = Number(state.nutrition?.goals?.calories ?? 2200)

  const mobilityCompletedToday = (flowId) =>
    (state.mobility?.completed ?? []).some((item) => {
      const date = String(item?.completedAt ?? '').slice(0, 10)
      return (
        date === now.toISOString().slice(0, 10) &&
        (!flowId || item?.flowId === flowId)
      )
    })

  const sanitizedTodayWorkout = todayWorkout
    ? {
        ...todayWorkout,
        assignment: sanitizeAssignment(
          todayWorkout.assignment ?? activeCoachAssignment,
        ),
      }
    : null

  return {
    generatedAt: now.toISOString(),
    athlete: {
      firstName: extractFirstName(options.userName),
    },
    daypart: daypart(now),
    workout: {
      displayName: workoutName,
      formattedName: formatWorkoutName(workoutName),
      source: briefing.workout?.source ?? null,
      coachAssigned: Boolean(briefing.workout?.coachAssigned),
      isRestDay: Boolean(briefing.workout?.isRestDay),
      isActive: Boolean(state.activeWorkout?.name),
      activeName: state.activeWorkout?.name ?? null,
      exercises: resolveWorkoutExercises(
        state,
        workoutName,
        activeCoachAssignment,
      ),
    },
    assignment: sanitizeAssignment(activeCoachAssignment),
    assignments: assignments
      .map((item) => sanitizeAssignment(item))
      .filter(Boolean),
    briefing: {
      dailyState: briefing.dailyState,
      headline: briefing.headline,
      summary: briefing.summary,
      primaryAction: briefing.primaryAction ?? null,
      secondaryAction: briefing.secondaryAction ?? null,
      watchItem: briefing.watchItem ?? null,
      confidence: briefing.confidence,
      isLowData: briefing.isLowData,
    },
    readiness: {
      completed: ctx.readiness.completed,
      score: ctx.readiness.completed ? ctx.readiness.score : null,
      status: ctx.readiness.completed ? ctx.readiness.status : null,
      factors: (ctx.readiness.factors ?? []).map((factor) => ({
        label: factor.label,
        value: factor.value,
        concern: Boolean(factor.concern),
      })),
    },
    recovery: {
      score: ctx.recovery.score,
      status: ctx.recovery.status,
      insight: ctx.recovery.insight,
      workoutsThisWeek: ctx.recovery.workoutsThisWeek,
      recoveryFlowsThisWeek: ctx.recovery.recoveryFlowsThisWeek,
      mobilityResetDone: mobilityCompletedToday('daily-reset'),
      recoveryFlowDone: mobilityCompletedToday('recovery-flow'),
    },
    training: {
      recentSessionCount: recentWorkouts.length,
      currentStreak: analytics.currentStreak,
      daysSinceLastWorkout: briefing.daysSinceLastWorkout ?? null,
      lastSessionName: ctx.lastSession?.name ?? null,
      lastSessionDate: ctx.lastSession
        ? String(sessionDate(ctx.lastSession)).slice(0, 10)
        : null,
    },
    nutrition: {
      hasLoggedFood: (nutritionDay?.foods?.length ?? 0) > 0,
      calories: Math.round(nutritionTotalsToday.calories),
      calorieGoal,
      protein: Math.round(nutritionTotalsToday.protein),
      proteinGoal,
      proteinProgress:
        proteinGoal > 0
          ? Math.round((nutritionTotalsToday.protein / proteinGoal) * 100)
          : null,
    },
    performance: performanceWin
      ? {
          exercise: performanceWin.exercise,
          type: performanceWin.type,
          value: performanceWin.value,
          date: performanceWin.date,
        }
      : null,
    evidence,
    facts: {
      canonicalWorkout: workoutName,
      canonicalWorkoutFormatted: formatWorkoutName(workoutName),
    },
    todayWorkout: sanitizedTodayWorkout,
    planningOwnership,
    hasCoachRelationship: Boolean(assignments.length),
    activeWorkout: state.activeWorkout ?? null,
    executionFocusLabel,
    todayWorkoutExercises: resolveWorkoutExercises(
      state,
      workoutName,
      activeCoachAssignment,
    ),
  }
}

export { lastSessionForMuscle, formatWorkoutName }
