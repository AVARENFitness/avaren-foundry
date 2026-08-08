/**
 * AVA trust-boundary helpers (Patch 7.7.4).
 *
 * Trust classes:
 * - SERVER_TRUSTED: fetched/derived from Supabase under authenticated user RLS
 * - USER_SUBJECTIVE: session statements/constraints from the athlete
 * - CLIENT_HINTS: advisory UI hints (daypart, timezone) — never authoritative facts
 *
 * The Edge Function mirrors this logic in supabase/functions/ava-chat/trustedContext.ts
 */

import { calculateReadiness } from './readiness'
import {
  assignmentDisplayName,
  resolveActiveCoachAssignment,
} from './coachAssignments'
import { resolveTodayWorkoutContext, WORKOUT_SOURCE } from './todayWorkout'
import { nutritionTotals } from './nutrition'

export const AVA_TRUST_LEVELS = {
  SERVER_TRUSTED: 'server-trusted',
  USER_SUBJECTIVE: 'user-subjective',
  CLIENT_HINTS: 'client-hints',
}

const MAX_EXERCISES = 8
const MAX_HISTORY = 12
const MAX_RECENT_SESSIONS = 5
const DAY_MS = 86400000

const todayKey = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 10)

const formatWorkoutName = (name) => {
  if (!name) return null
  return String(name).replace(/\s*\+\s*/g, ' & ')
}

const sessionDate = (session) =>
  session?.finishedAt ??
  (session?.date ? `${session.date}T12:00:00` : null)

export const sanitizeServerAssignments = (assignments = []) =>
  [...assignments]
    .filter((item) => ['assigned', 'started'].includes(item?.status))
    .map((item) => ({
      id: item.id,
      title: item.title ?? null,
      status: item.status,
      due_date: item.due_date ?? item.scheduled_date ?? null,
      workout_payload: item.workout_payload ?? null,
      coach_notes: item.coach_notes ?? null,
    }))

export const sanitizeAthleteCoachAssignment = (assignment) => {
  if (!assignment) return null

  const workoutName = assignmentDisplayName(assignment)
  return {
    id: assignment.id,
    title: assignment.title ?? workoutName,
    workoutName,
    athleteNotes: assignment.coach_notes ?? null,
    exercises: (assignment.workout_payload?.exercises ?? [])
      .slice(0, MAX_EXERCISES)
      .map((item) => ({
        name: item.name ?? item.exercise ?? 'Exercise',
        sets: item.sets ?? null,
        muscle: item.muscle ?? null,
      })),
  }
}

export const resolveTrustedWorkoutContext = (
  foundryState = {},
  serverAssignments = [],
  now = new Date(),
) => {
  const assignments = sanitizeServerAssignments(serverAssignments)
  const activeAssignment = resolveActiveCoachAssignment(assignments, now)

  return resolveTodayWorkoutContext(foundryState ?? {}, {
    now,
    assignments,
    activeCoachAssignment: activeAssignment,
  })
}

export const resolveWorkoutExercises = (
  foundryState = {},
  workoutName,
  assignment = null,
) => {
  if (assignment?.workout_payload?.exercises?.length) {
    return assignment.workout_payload.exercises
      .slice(0, MAX_EXERCISES)
      .map((item) => ({
        name: item.name ?? item.exercise ?? 'Exercise',
        sets: item.sets ?? null,
        muscle: item.muscle ?? null,
      }))
  }

  const programExercises = foundryState?.program?.workouts?.[workoutName]
  if (Array.isArray(programExercises) && programExercises.length) {
    return programExercises.slice(0, MAX_EXERCISES).map((item) => ({
      name: item.name ?? item.exercise ?? 'Exercise',
      sets: item.sets ?? null,
      muscle: item.muscle ?? null,
    }))
  }

  return []
}

export const buildTrustedReadiness = (foundryState = {}, now = new Date()) => {
  const readiness = calculateReadiness(foundryState ?? {}, now)

  if (!readiness.completed) {
    return {
      trust: AVA_TRUST_LEVELS.SERVER_TRUSTED,
      completed: false,
      score: null,
      status: null,
      factors: [],
    }
  }

  return {
    trust: AVA_TRUST_LEVELS.SERVER_TRUSTED,
    completed: true,
    score: readiness.score,
    status: readiness.status,
    factors: (readiness.factors ?? []).map((factor) => ({
      label: factor.label,
      value: factor.value,
      concern: Boolean(factor.concern),
    })),
  }
}

const mobilityCompletedToday = (foundryState = {}, flowId, now = new Date()) => {
  const key = todayKey(now)
  return (foundryState?.mobility?.completed ?? []).some((item) => {
    const date = String(item?.completedAt ?? '').slice(0, 10)
    return date === key && (!flowId || item?.flowId === flowId)
  })
}

export const buildTrustedRecovery = (foundryState = {}, now = new Date()) => {
  const recentMobility = (foundryState?.mobility?.completed ?? []).filter(
    (entry) => {
      const time = new Date(entry.completedAt).getTime()
      return Number.isFinite(time) && now.getTime() - time <= 7 * DAY_MS
    },
  )

  const workoutsThisWeek = (foundryState?.history ?? []).filter((session) => {
    const value = sessionDate(session)
    const time = new Date(value).getTime()
    return Number.isFinite(time) && now.getTime() - time <= 7 * DAY_MS
  }).length

  return {
    trust: AVA_TRUST_LEVELS.SERVER_TRUSTED,
    mobilityResetDone: mobilityCompletedToday(foundryState, 'daily-reset', now),
    recoveryFlowDone: mobilityCompletedToday(
      foundryState,
      'recovery-flow',
      now,
    ),
    recoveryFlowsThisWeek: recentMobility.filter(
      (item) => item.flowId === 'recovery-flow',
    ).length,
    workoutsThisWeek,
  }
}

export const buildTrustedRecentTraining = (
  foundryState = {},
  now = new Date(),
) => {
  const history = (foundryState?.history ?? []).filter((session) =>
    Array.isArray(session?.sets),
  )

  const recent = history
    .filter((session) => {
      const value = sessionDate(session)
      const time = new Date(value).getTime()
      return Number.isFinite(time) && now.getTime() - time <= 7 * DAY_MS
    })
    .sort((a, b) => String(sessionDate(a)).localeCompare(String(sessionDate(b))))

  const lastSession = recent.at(-1) ?? null

  return {
    trust: AVA_TRUST_LEVELS.SERVER_TRUSTED,
    recentSessionCount: recent.length,
    lastSessionName: lastSession?.name ?? null,
    lastSessionDate: lastSession
      ? String(sessionDate(lastSession)).slice(0, 10)
      : null,
    recentSessions: recent.slice(-MAX_RECENT_SESSIONS).map((session) => ({
      name: session.name ?? null,
      date: String(sessionDate(session)).slice(0, 10),
    })),
  }
}

export const buildTrustedNutrition = ({
  nutritionProfile = null,
  nutritionDay = null,
  foundryState = null,
  now = new Date(),
} = {}) => {
  const goals = nutritionProfile?.goals ??
    foundryState?.nutrition?.goals ?? {
      calories: 2200,
      protein: 170,
    }

  const daySnapshot =
    nutritionDay?.snapshot ??
    foundryState?.nutrition?.days?.[todayKey(now)] ??
    null

  const totals = nutritionTotals(daySnapshot)
  const hasLoggedFood = (daySnapshot?.foods?.length ?? 0) > 0
  const proteinGoal = Number(goals.protein ?? 170)
  const calorieGoal = Number(goals.calories ?? 2200)

  return {
    trust: AVA_TRUST_LEVELS.SERVER_TRUSTED,
    hasLoggedFood,
    calories: hasLoggedFood ? Math.round(totals.calories) : null,
    calorieGoal,
    protein: hasLoggedFood ? Math.round(totals.protein) : null,
    proteinGoal,
    proteinProgress:
      hasLoggedFood && proteinGoal > 0
        ? Math.round((totals.protein / proteinGoal) * 100)
        : null,
  }
}

export const extractSessionContext = (body = {}) => {
  const conversation = body.sessionContext ?? body.conversation ?? {}

  return {
    trust: AVA_TRUST_LEVELS.USER_SUBJECTIVE,
    recentMessages: Array.isArray(conversation.recentMessages)
      ? conversation.recentMessages
          .slice(-MAX_HISTORY)
          .map((item) => ({
            role: item?.role === 'user' ? 'user' : 'ava',
            text: String(item?.text ?? '').slice(0, 1200),
          }))
      : [],
    temporaryConstraints: Array.isArray(conversation.temporaryConstraints)
      ? conversation.temporaryConstraints
          .slice(0, 4)
          .map((item) => String(item ?? '').slice(0, 400))
      : [],
    userStatements: Array.isArray(conversation.userStatements)
      ? conversation.userStatements
          .slice(0, 6)
          .map((item) => String(item ?? '').slice(0, 400))
      : [],
    topic: conversation.topic ?? null,
    lastRecommendation: conversation.lastRecommendation
      ? String(conversation.lastRecommendation).slice(0, 1200)
      : null,
  }
}

export const extractClientHints = (body = {}) => {
  const hints = body.clientHints ?? {}

  return {
    trust: AVA_TRUST_LEVELS.CLIENT_HINTS,
    daypart: hints.daypart ? String(hints.daypart).slice(0, 20) : null,
    timezoneOffset:
      typeof hints.timezoneOffset === 'number' ? hints.timezoneOffset : null,
  }
}

/**
 * Reject cross-user identity fields in payload.
 * Returns authenticated user id only — never trusts body user identifiers.
 */
export const resolveAuthenticatedUserId = (authenticatedUserId, body = {}) => {
  const spoofed =
    body.userId ??
    body.user_id ??
    body.athleteId ??
    body.athlete_id ??
    body.clientId ??
    body.client_id ??
    null

  if (spoofed && String(spoofed) !== String(authenticatedUserId)) {
    return {
      userId: authenticatedUserId,
      rejectedSpoofedIdentity: true,
    }
  }

  return {
    userId: authenticatedUserId,
    rejectedSpoofedIdentity: false,
  }
}

export const buildTrustedModelContext = ({
  authenticatedUserId,
  foundryState = null,
  serverAssignments = [],
  nutritionProfile = null,
  nutritionDay = null,
  sessionContext = {},
  clientHints = {},
  profileFirstName = null,
  now = new Date(),
  hasCloudState = true,
} = {}) => {
  const state = foundryState ?? {}
  const assignments = sanitizeServerAssignments(serverAssignments)
  const activeAssignment = resolveActiveCoachAssignment(assignments, now)
  const workout = resolveTrustedWorkoutContext(state, assignments, now)
  const sanitizedAssignment = sanitizeAthleteCoachAssignment(activeAssignment)
  const exercises = resolveWorkoutExercises(
    state,
    workout.name,
    activeAssignment,
  )

  const trustedToday = {
    trust: AVA_TRUST_LEVELS.SERVER_TRUSTED,
    source: hasCloudState ? 'cloud-sync' : 'unverified-local-only',
    canonicalWorkout: workout.name ?? null,
    canonicalWorkoutFormatted: formatWorkoutName(workout.name),
    workoutSource: workout.source ?? WORKOUT_SOURCE.NONE,
    coachAssigned: Boolean(workout.coachAssigned),
    isRestDay: Boolean(workout.isRestDay),
    isActiveWorkout: Boolean(state.activeWorkout?.name),
    activeWorkoutName: state.activeWorkout?.name ?? null,
    exercises,
    readiness: buildTrustedReadiness(state, now),
    recovery: buildTrustedRecovery(state, now),
    coachAssignment: sanitizedAssignment,
  }

  return {
    athlete: {
      firstName: profileFirstName ?? null,
    },
    serverFacts: {
      authenticatedUserId,
      trustedToday,
      recentTraining: buildTrustedRecentTraining(state, now),
      nutrition: buildTrustedNutrition({
        nutritionProfile,
        nutritionDay,
        foundryState: state,
        now,
      }),
    },
    sessionContext: {
      ...sessionContext,
      trust: AVA_TRUST_LEVELS.USER_SUBJECTIVE,
    },
    clientHints: {
      ...clientHints,
      trust: AVA_TRUST_LEVELS.CLIENT_HINTS,
      advisoryOnly: true,
    },
  }
}

export const buildModelPayload = ({
  message = '',
  trustedContext = {},
}) =>
  JSON.stringify(
    {
      athleteMessage: String(message ?? '').trim().slice(0, 2000),
      avarenContext: trustedContext,
    },
    null,
    0,
  )
