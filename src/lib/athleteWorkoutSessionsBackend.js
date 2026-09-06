import { isSupabaseConfigured, supabase } from './supabase'
import {
  ATHLETE_WORKOUT_SESSION_SOURCE,
  durableRowFromHistorySession,
  historySessionFromDurableRow,
  mergeWorkoutHistory,
} from './athleteWorkoutHistory'

const QUEUE_PREFIX = 'avaren-durable-workout-queue'

const queueKey = (athleteId) => `${QUEUE_PREFIX}:${String(athleteId)}`

const missingBackend = (error) =>
  error?.code === '42P01' ||
  error?.code === '42883' ||
  /does not exist/i.test(error?.message ?? '')

const readQueue = (athleteId) => {
  if (!athleteId || typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(queueKey(athleteId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeQueue = (athleteId, rows) => {
  if (!athleteId || typeof localStorage === 'undefined') return
  localStorage.setItem(queueKey(athleteId), JSON.stringify(rows ?? []))
}

const enqueueDurableOp = (athleteId, session, operation) => {
  const row = durableRowFromHistorySession(session, { athleteId })
  if (!row) return null

  const next = {
    ...row,
    _operation: operation,
  }

  const queue = readQueue(athleteId).filter(
    (item) =>
      !(
        item.session_id === next.session_id &&
        (item._operation ?? 'complete') === operation
      ),
  )
  queue.push(next)
  writeQueue(athleteId, queue)
  return next
}

export const enqueueDurableWorkoutSession = (athleteId, session) =>
  enqueueDurableOp(athleteId, session, 'complete')

export const listQueuedDurableWorkoutSessions = (athleteId) =>
  readQueue(athleteId)

export const clearQueuedDurableWorkoutSession = (
  athleteId,
  sessionId,
  operation = null,
) => {
  writeQueue(
    athleteId,
    readQueue(athleteId).filter((item) => {
      if (item.session_id !== String(sessionId)) return true
      if (!operation) return false
      return (item._operation ?? 'complete') !== operation
    }),
  )
}

const editableColumnsFromSession = (session, athleteId) => {
  const row = durableRowFromHistorySession(session, { athleteId })
  if (!row) return null

  return {
    workout_name: row.workout_name,
    workout_key: row.workout_key,
    started_at: row.started_at,
    completed_at: row.completed_at,
    duration_seconds: row.duration_seconds,
    session_payload: {
      ...row.session_payload,
      id: row.session_id,
    },
    completion_summary: row.completion_summary,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Idempotent first completion.
 * INSERT ... ON CONFLICT DO NOTHING — never overwrites an existing row.
 */
export async function completeWorkoutSession(
  athleteId,
  session,
  { source = ATHLETE_WORKOUT_SESSION_SOURCE.ATHLETE_APP } = {},
) {
  const row = durableRowFromHistorySession(session, { athleteId, source })
  if (!row) throw new Error('Invalid workout session.')

  if (!isSupabaseConfigured || !supabase) {
    enqueueDurableOp(athleteId, session, 'complete')
    return { row, queued: true, persisted: false, created: false }
  }

  const { error } = await supabase.from('athlete_workout_sessions').upsert(
    {
      ...row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'athlete_id,session_id', ignoreDuplicates: true },
  )

  if (error) {
    if (missingBackend(error) || !navigator?.onLine) {
      enqueueDurableOp(athleteId, session, 'complete')
      return { row, queued: true, persisted: false, created: false, error }
    }
    enqueueDurableOp(athleteId, session, 'complete')
    throw error
  }

  clearQueuedDurableWorkoutSession(athleteId, row.session_id, 'complete')
  return { row, queued: false, persisted: true, created: true }
}

/**
 * Intentional edit of one existing completed session.
 * Never changes athlete_id / session_id / id / created_at.
 */
export async function updateWorkoutSession(athleteId, session) {
  const sessionId = String(session?.id ?? session?.session_id ?? '')
  if (!athleteId || !sessionId) {
    throw new Error('Workout session identity required.')
  }

  const patch = editableColumnsFromSession(
    { ...session, id: sessionId },
    athleteId,
  )
  if (!patch) throw new Error('Invalid workout session edit.')

  // Identity is enforced in DB trigger; never send immutable columns.
  if (!isSupabaseConfigured || !supabase) {
    enqueueDurableOp(athleteId, { ...session, id: sessionId }, 'edit')
    return {
      sessionId,
      athleteId,
      queued: true,
      persisted: false,
      patch,
    }
  }

  const { data, error } = await supabase
    .from('athlete_workout_sessions')
    .update(patch)
    .eq('athlete_id', athleteId)
    .eq('session_id', sessionId)
    .select('athlete_id, session_id, id, created_at')
    .maybeSingle()

  if (error) {
    if (missingBackend(error) || !navigator?.onLine) {
      enqueueDurableOp(athleteId, { ...session, id: sessionId }, 'edit')
      return {
        sessionId,
        athleteId,
        queued: true,
        persisted: false,
        patch,
        error,
      }
    }
    throw error
  }

  if (!data) {
    throw new Error('Workout session not found.')
  }

  clearQueuedDurableWorkoutSession(athleteId, sessionId, 'edit')
  return {
    sessionId: data.session_id,
    athleteId: data.athlete_id,
    id: data.id,
    createdAt: data.created_at,
    queued: false,
    persisted: true,
    patch,
  }
}

/** @deprecated Use completeWorkoutSession for first completion. */
export async function upsertAthleteWorkoutSession(athleteId, session, options) {
  return completeWorkoutSession(athleteId, session, options)
}

export async function listAthleteWorkoutSessions(athleteId, { limit = 500 } = {}) {
  if (!athleteId) return []
  if (!isSupabaseConfigured || !supabase) {
    return readQueue(athleteId)
      .map(historySessionFromDurableRow)
      .filter(Boolean)
  }

  const { data, error } = await supabase
    .from('athlete_workout_sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('completed_at', { ascending: true })
    .limit(limit)

  if (error) {
    if (missingBackend(error)) {
      return readQueue(athleteId)
        .map(historySessionFromDurableRow)
        .filter(Boolean)
    }
    throw error
  }

  return (data ?? []).map(historySessionFromDurableRow).filter(Boolean)
}

export async function flushDurableWorkoutQueue(athleteId) {
  if (!athleteId || !isSupabaseConfigured || !supabase) return { flushed: 0 }

  const queue = readQueue(athleteId)
  let flushed = 0

  for (const row of queue) {
    const session = historySessionFromDurableRow(row)
    if (!session) {
      clearQueuedDurableWorkoutSession(athleteId, row.session_id)
      continue
    }

    const operation = row._operation ?? 'complete'

    try {
      const result =
        operation === 'edit'
          ? await updateWorkoutSession(athleteId, session)
          : await completeWorkoutSession(athleteId, session, {
              source: row.source ?? ATHLETE_WORKOUT_SESSION_SOURCE.ATHLETE_APP,
            })
      if (result.persisted) flushed += 1
    } catch (error) {
      console.error('Durable workout queue flush failed:', error)
      break
    }
  }

  return { flushed }
}

export async function loadMergedAthleteWorkoutHistory(
  athleteId,
  localHistory = [],
) {
  const durable = await listAthleteWorkoutSessions(athleteId).catch(() => [])
  const queued = readQueue(athleteId)
    .map(historySessionFromDurableRow)
    .filter(Boolean)

  return mergeWorkoutHistory(localHistory, durable, queued)
}

export async function listAthleteWorkoutSessionsForAthletes(
  athleteIds = [],
  { limitPerAthlete = 200 } = {},
) {
  const ids = [...new Set((athleteIds ?? []).filter(Boolean).map(String))]
  if (!ids.length || !isSupabaseConfigured || !supabase) return {}

  const { data, error } = await supabase
    .from('athlete_workout_sessions')
    .select('*')
    .in('athlete_id', ids)
    .order('completed_at', { ascending: false })
    .limit(Math.max(ids.length * limitPerAthlete, limitPerAthlete))

  if (error) {
    if (missingBackend(error)) return {}
    return {}
  }

  const byAthlete = {}
  for (const row of data ?? []) {
    const athleteId = row.athlete_id
    const session = historySessionFromDurableRow(row)
    if (!session) continue
    if (!byAthlete[athleteId]) byAthlete[athleteId] = []
    byAthlete[athleteId].push(session)
  }

  for (const athleteId of Object.keys(byAthlete)) {
    byAthlete[athleteId] = mergeWorkoutHistory(byAthlete[athleteId])
  }

  return byAthlete
}

export const buildEditableWorkoutPatch = (session, athleteId) =>
  editableColumnsFromSession(session, athleteId)

export const assertEditableIdentityPreserved = (before, after) => {
  if (!before || !after) return false
  return (
    String(before.id) === String(after.id) &&
    String(before.athleteId ?? before.athlete_id ?? '') ===
      String(after.athleteId ?? after.athlete_id ?? '') &&
    String(before.session_id ?? before.id) ===
      String(after.session_id ?? after.id)
  )
}
