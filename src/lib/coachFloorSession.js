import { supabase } from './supabase'
import { createRuntimeId } from './createRuntimeId'

const DRAFT_PREFIX = 'avaren-coach-floor-draft'

const safeNumberText = (value) =>
  value == null ? '' : String(value).replace(/[^0-9.\-]/g, '')

const repTarget = (exercise = {}) => {
  const reps = exercise.reps ?? exercise.prescription?.reps
  if (typeof reps === 'string' || typeof reps === 'number') return String(reps)
  if (reps?.min != null && reps?.max != null) {
    return reps.min === reps.max ? String(reps.min) : `${reps.min}-${reps.max}`
  }
  return ''
}

const setCount = (exercise = {}) =>
  Math.max(1, Number(exercise.sets ?? exercise.prescription?.sets ?? 3) || 3)

export const makeFloorSet = (seed = {}) => ({
  id: seed.id ?? createRuntimeId(),
  weight: safeNumberText(seed.weight ?? ''),
  reps: safeNumberText(seed.reps ?? ''),
  type: seed.type ?? 'Working',
  note: seed.note ?? '',
  completed: Boolean(seed.completed),
})

export const makeFloorExercise = (seed = {}) => ({
  id: seed.id ?? createRuntimeId(),
  name: String(seed.name ?? 'New Exercise').trim() || 'New Exercise',
  muscle: seed.muscle ?? 'Other',
  targetReps: seed.targetReps ?? repTarget(seed),
  loadType: seed.loadType ?? 'external',
  notes: seed.notes ?? '',
  sets: Array.isArray(seed.sets)
    ? seed.sets.map(makeFloorSet)
    : Array.from({ length: setCount(seed) }, () => makeFloorSet()),
})

export const buildFloorWorkoutFromAssignment = (assignment = null) => {
  const workout = assignment?.workout_payload ?? assignment?.workout ?? null
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : []

  return {
    name:
      String(workout?.name ?? assignment?.title ?? 'In-person workout').trim() ||
      'In-person workout',
    assignmentId: assignment?.id ?? null,
    exercises: exercises.map(makeFloorExercise),
  }
}

export const buildFloorWorkoutFromHistory = (session = null) => {
  if (!session) return null
  const grouped = new Map()

  for (const set of session.sets ?? []) {
    const name = String(set?.exercise ?? '').trim()
    if (!name) continue
    if (!grouped.has(name)) {
      grouped.set(name, {
        id: createRuntimeId(),
        name,
        muscle: set.muscle ?? 'Other',
        targetReps: '',
        loadType: set.loadType ?? 'external',
        notes: '',
        sets: [],
      })
    }
    grouped.get(name).sets.push(
      makeFloorSet({
        weight: set.weight ?? set.load ?? '',
        reps: set.reps ?? '',
        type: set.type ?? 'Working',
      }),
    )
  }

  const exercises = [...grouped.values()]
  if (!exercises.length) return null

  return {
    name: String(session.name ?? 'In-person workout'),
    assignmentId: null,
    exercises,
  }
}

export const flattenFloorWorkout = (workout = {}) => {
  const sets = []
  const exercisesPerformed = []

  for (const exercise of workout.exercises ?? []) {
    const completedSets = (exercise.sets ?? []).filter(
      (set) => set.completed || set.weight !== '' || set.reps !== '',
    )
    if (!completedSets.length) continue

    exercisesPerformed.push(exercise.name)
    completedSets.forEach((set, index) => {
      sets.push({
        id: set.id,
        exercise: exercise.name,
        muscle: exercise.muscle ?? 'Other',
        weight: Number(set.weight || 0),
        reps: Number(set.reps || 0),
        type: set.type ?? 'Working',
        loadType: exercise.loadType ?? 'external',
        note: String(set.note ?? '').trim(),
        setNumber: index + 1,
      })
    })
  }

  return {
    name: String(workout.name ?? 'In-person workout').trim() || 'In-person workout',
    sets,
    exercisesPerformed,
  }
}

export const previousPerformanceByExercise = (history = []) => {
  const result = new Map()
  const newestFirst = [...(history ?? [])].sort(
    (a, b) =>
      new Date(b.finishedAt ?? b.date ?? 0).getTime() -
      new Date(a.finishedAt ?? a.date ?? 0).getTime(),
  )

  for (const session of newestFirst) {
    for (const set of session.sets ?? []) {
      const name = String(set?.exercise ?? '').trim().toLowerCase()
      if (!name) continue
      if (!result.has(name)) result.set(name, [])
      if (result.get(name).length >= 8) continue
      result.get(name).push({
        weight: Number(set.weight ?? set.load ?? 0),
        reps: Number(set.reps ?? 0),
        type: set.type ?? 'Working',
        sessionName: session.name ?? 'Previous workout',
        finishedAt: session.finishedAt ?? session.date ?? null,
      })
    }
  }

  return result
}

export const formatPreviousSet = (set = null) => {
  if (!set) return 'No previous set'
  const weight = Number(set.weight || 0)
  const reps = Number(set.reps || 0)
  if (weight > 0 && reps > 0) return `${weight} × ${reps}`
  if (reps > 0) return `${reps} reps`
  return 'Previous set'
}

export const floorDraftKey = (scheduledSessionId) =>
  `${DRAFT_PREFIX}:${String(scheduledSessionId ?? '')}`

export const saveLocalFloorDraft = (scheduledSessionId, draft) => {
  if (!scheduledSessionId || typeof localStorage === 'undefined') return
  localStorage.setItem(floorDraftKey(scheduledSessionId), JSON.stringify(draft))
}

export const readLocalFloorDraft = (scheduledSessionId) => {
  if (!scheduledSessionId || typeof localStorage === 'undefined') return null
  try {
    const parsed = JSON.parse(localStorage.getItem(floorDraftKey(scheduledSessionId)) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export const clearLocalFloorDraft = (scheduledSessionId) => {
  if (!scheduledSessionId || typeof localStorage === 'undefined') return
  localStorage.removeItem(floorDraftKey(scheduledSessionId))
}

const normalizeFloorRow = (row) =>
  row
    ? {
        id: row.id,
        coachId: row.coach_id,
        scheduledSessionId: row.scheduled_session_id,
        businessClientId: row.business_client_id,
        athleteId: row.athlete_id,
        assignmentId: row.assignment_id,
        status: row.status,
        workoutName: row.workout_name,
        workoutPayload: row.workout_payload ?? {},
        privateCoachNote: row.private_coach_note ?? '',
        athleteRecap: row.athlete_recap ?? '',
        startedAt: row.started_at,
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
      }
    : null

export const coachFloorBackend = {
  async getFloorSession(scheduledSessionId) {
    const { data, error } = await supabase
      .from('coach_floor_sessions')
      .select('*')
      .eq('scheduled_session_id', scheduledSessionId)
      .maybeSingle()
    if (error) throw error
    return normalizeFloorRow(data)
  },

  async listFloorSessions({ businessClientId, limit = 20 } = {}) {
    if (!businessClientId) return []
    const { data, error } = await supabase
      .from('coach_floor_sessions')
      .select('*')
      .eq('business_client_id', businessClientId)
      .order('started_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(normalizeFloorRow).filter(Boolean)
  },

  async saveDraft({
    scheduledSessionId,
    workout,
    startedAt,
    privateCoachNote = '',
    athleteRecap = '',
  }) {
    const payload = flattenFloorWorkout(workout)
    const { data, error } = await supabase.rpc('save_coach_floor_session', {
      p_scheduled_session_id: scheduledSessionId,
      p_workout_name: payload.name,
      p_workout_payload: {
        ...payload,
        floorExercises: workout.exercises ?? [],
      },
      p_started_at: startedAt,
      p_private_coach_note: privateCoachNote,
      p_athlete_recap: athleteRecap,
    })
    if (error) throw error
    return normalizeFloorRow(data)
  },

  async complete({
    scheduledSessionId,
    workout,
    startedAt,
    privateCoachNote = '',
    athleteRecap = '',
  }) {
    const payload = flattenFloorWorkout(workout)
    const { data, error } = await supabase.rpc('complete_coach_floor_session', {
      p_scheduled_session_id: scheduledSessionId,
      p_workout_name: payload.name,
      p_workout_payload: {
        ...payload,
        floorExercises: workout.exercises ?? [],
      },
      p_started_at: startedAt,
      p_private_coach_note: privateCoachNote,
      p_athlete_recap: athleteRecap,
    })
    if (error) throw error
    return data
  },
}
