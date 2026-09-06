/**
 * Canonical athlete workout history adapter.
 * Durable DB rows ↔ existing foundry_state.history session shape.
 */

export const ATHLETE_WORKOUT_SESSION_SOURCE = {
  ATHLETE_APP: 'athlete_app',
  BACKFILL: 'foundry_state_backfill',
}

const sessionIdOf = (session) => {
  const id = session?.id ?? session?.session_id ?? session?.sessionId
  return id == null || id === '' ? null : String(id)
}

const toTime = (value) => {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

export const sessionDurationSeconds = (session = {}) => {
  const started = toTime(session.startedAt ?? session.started_at)
  const finished = toTime(
    session.finishedAt ?? session.completed_at ?? session.completedAt,
  )
  if (!started || !finished || finished < started) return null
  return Math.max(1, Math.round((finished - started) / 1000))
}

export const buildCompletionSummary = (session = {}) => {
  const sets = Array.isArray(session.sets) ? session.sets : []
  const exercises = [
    ...new Set(sets.map((set) => set?.exercise).filter(Boolean)),
  ]

  return {
    sets: sets.length,
    exercises: exercises.length,
    assignmentId: session.assignmentId ?? null,
    sessionMode: session.sessionMode ?? null,
    reflection: Boolean(session.reflection),
    loadTypes: [
      ...new Set(sets.map((set) => set?.loadType).filter(Boolean)),
    ],
    hasSuperset: sets.some(
      (set) =>
        set?.prescription?.supersetGroup != null ||
        set?.supersetGroup != null,
    ),
  }
}

export const preferRicherSession = (first, second) => {
  if (!first) return second
  if (!second) return first

  const freshness = (session) =>
    Math.max(
      toTime(session.editedAt),
      toTime(session.updatedAt),
      toTime(session.finishedAt),
    )

  const firstFresh = freshness(first)
  const secondFresh = freshness(second)
  if (firstFresh && secondFresh && secondFresh !== firstFresh) {
    return secondFresh > firstFresh ? second : first
  }

  const firstSets = Array.isArray(first.sets) ? first.sets.length : 0
  const secondSets = Array.isArray(second.sets) ? second.sets.length : 0
  if (secondSets !== firstSets) {
    return secondSets > firstSets ? second : first
  }

  return second.reflection || second.notes ? second : first
}

export const mergeWorkoutHistory = (...lists) => {
  const byId = new Map()

  lists.flat().forEach((session) => {
    const id = sessionIdOf(session)
    if (!id) return
    const normalized = {
      ...session,
      id,
    }
    byId.set(id, preferRicherSession(byId.get(id), normalized))
  })

  return [...byId.values()].sort(
    (a, b) => toTime(a.finishedAt ?? a.date) - toTime(b.finishedAt ?? b.date),
  )
}

export const historySessionFromDurableRow = (row = {}) => {
  const payload =
    row.session_payload && typeof row.session_payload === 'object'
      ? row.session_payload
      : {}

  const id = String(row.session_id ?? payload.id ?? '')
  if (!id) return null

  return {
    ...payload,
    id,
    name: payload.name ?? row.workout_name ?? 'Workout',
    date: payload.date
    ?? (row.completed_at || row.completedAt || payload.finishedAt
      ? String(row.completed_at ?? row.completedAt ?? payload.finishedAt).slice(0, 10)
      : null),
    startedAt: payload.startedAt ?? row.started_at ?? null,
    finishedAt:
      payload.finishedAt ?? row.completed_at ?? row.completedAt ?? null,
    assignmentId:
      payload.assignmentId ?? row.assignment_id ?? null,
    sets: Array.isArray(payload.sets) ? payload.sets : [],
    exercisesPerformed: Array.isArray(payload.exercisesPerformed)
      ? payload.exercisesPerformed
      : [],
  }
}

export const durableRowFromHistorySession = (
  session = {},
  {
    athleteId,
    source = ATHLETE_WORKOUT_SESSION_SOURCE.ATHLETE_APP,
  } = {},
) => {
  const sessionId = sessionIdOf(session)
  if (!sessionId || !athleteId) return null

  const completedAt =
    session.finishedAt ?? session.completedAt ?? new Date().toISOString()

  return {
    athlete_id: athleteId,
    session_id: sessionId,
    assignment_id: session.assignmentId ?? null,
    workout_name: String(session.name ?? 'Workout').slice(0, 200),
    workout_key: String(session.workoutKey ?? session.name ?? sessionId).slice(
      0,
      200,
    ),
    started_at: session.startedAt ?? null,
    completed_at: completedAt,
    duration_seconds: sessionDurationSeconds({
      ...session,
      finishedAt: completedAt,
    }),
    session_payload: {
      ...session,
      id: sessionId,
      finishedAt: completedAt,
    },
    completion_summary: buildCompletionSummary({
      ...session,
      finishedAt: completedAt,
    }),
    source,
  }
}

export const isEmptyTrainingShell = (state = {}) => {
  const historyLength = Array.isArray(state?.history) ? state.history.length : 0
  return (
    historyLength === 0 &&
    !state?.activeWorkout &&
    !(state?.achievements?.length > 0) &&
    !(state?.mobility?.completed?.length > 0)
  )
}

export const historyCannotShrink = (previous = [], next = []) => {
  const previousIds = new Set(
    (previous ?? []).map(sessionIdOf).filter(Boolean),
  )
  const nextIds = new Set((next ?? []).map(sessionIdOf).filter(Boolean))
  for (const id of previousIds) {
    if (!nextIds.has(id)) return false
  }
  return true
}
