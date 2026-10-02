import { createClient, SupabaseClient } from '@supabase/supabase-js'

const MAX_EXERCISES = 8
const MAX_RECENT_SESSIONS = 5
const DAY_MS = 86400000
const ACTIVE_STATUSES = ['assigned', 'started']

const LOAD_TYPES = {
  EXTERNAL: 'external',
  BODYWEIGHT: 'bodyweight',
  BODYWEIGHT_ADDED: 'bodyweight_added',
  ASSISTED: 'assisted',
} as const

const LOAD_TYPE_LABELS: Record<string, string> = {
  external: 'Weight',
  bodyweight: 'Bodyweight',
  bodyweight_added: 'Bodyweight + weight',
  assisted: 'Assisted',
}

const normalizeRepTarget = (value: unknown) => {
  if (value == null || value === '') return null

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as { min?: unknown; max?: unknown }
    const min = Number(record.min)
    const max = Number(record.max ?? record.min)
    if (!Number.isFinite(min) || min <= 0) return null
    return {
      min,
      max: Number.isFinite(max) && max > 0 ? max : min,
    }
  }

  const text = String(value).trim()
  if (!text) return null

  const rangeMatch = text.match(/^(\d+)\s*[-–—]\s*(\d+)$/)
  if (rangeMatch) {
    const min = Number(rangeMatch[1])
    const max = Number(rangeMatch[2])
    if (min > 0 && max >= min) return { min, max }
  }

  const exact = Number(text)
  if (Number.isFinite(exact) && exact > 0) return { min: exact, max: exact }
  return null
}

const normalizePrescription = (exercise: Record<string, unknown> = {}) => {
  const prescription = exercise.prescription as
    | { sets?: unknown; reps?: unknown }
    | undefined

  if (prescription?.sets != null) {
    const sets = Number(prescription.sets)
    const reps = normalizeRepTarget(prescription.reps)
    return {
      sets: Number.isFinite(sets) && sets > 0 ? sets : 3,
      reps,
    }
  }

  const sets = Number(exercise.sets)
  const reps = normalizeRepTarget(exercise.reps)

  return {
    sets: Number.isFinite(sets) && sets > 0 ? sets : 3,
    reps,
  }
}

const formatRepTarget = (prescription: { reps?: { min: number; max: number } | null }) => {
  const reps = prescription.reps
  if (!reps) return null
  if (reps.min === reps.max) return `${reps.min} reps`
  return `${reps.min}–${reps.max} reps`
}

const formatPrescriptionDisplay = (prescription: {
  sets: number
  reps?: { min: number; max: number } | null
}) => {
  const repLabel = formatRepTarget(prescription)
  if (repLabel) return `${prescription.sets} sets · ${repLabel}`
  return `${prescription.sets} sets`
}

const suggestDefaultLoadType = (exerciseName = '') => {
  const name = String(exerciseName).trim().toLowerCase()
  if (
    /pull-up|pullup|chin-up|chinup|push-up|pushup|dip|leg raise|plank hold/i.test(
      name,
    )
  ) {
    return LOAD_TYPES.BODYWEIGHT
  }
  return LOAD_TYPES.EXTERNAL
}

const normalizeLoadType = (value: unknown, exerciseName = '') => {
  const text = String(value ?? '')
  if (Object.values(LOAD_TYPES).includes(text as typeof LOAD_TYPES.EXTERNAL)) {
    return text
  }
  return suggestDefaultLoadType(exerciseName)
}

const loadTypeLabel = (loadType: string) =>
  LOAD_TYPE_LABELS[loadType] ?? 'Weight'

const mapTrustedExercise = (item: Record<string, unknown> = {}) => {
  const prescription = normalizePrescription(item)
  const loadType = normalizeLoadType(item.loadType, String(item.name ?? ''))

  return {
    name: item.name ?? item.exercise ?? 'Exercise',
    sets: prescription.sets,
    muscle: item.muscle ?? null,
    loadType,
    prescription,
    summary: [
      formatPrescriptionDisplay(prescription),
      loadType !== LOAD_TYPES.EXTERNAL ? loadTypeLabel(loadType) : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

const resolveSetLoadType = (
  set: Record<string, unknown>,
  exerciseLoadType?: unknown,
) => normalizeLoadType(set.loadType ?? exerciseLoadType, String(set.exercise ?? ''))

const formatCompletedSetDisplay = (set: Record<string, unknown> = {}) => {
  const loadType = resolveSetLoadType(set, set.loadType)
  const reps = Number(set.reps ?? 0)

  if (loadType === LOAD_TYPES.BODYWEIGHT) {
    return reps > 0 ? `BW × ${reps}` : 'BW'
  }

  if (loadType === LOAD_TYPES.BODYWEIGHT_ADDED) {
    const added = Number(set.addedWeight ?? set.weight ?? 0)
    return added > 0 ? `BW + ${added} lb × ${reps}` : `BW × ${reps}`
  }

  if (loadType === LOAD_TYPES.ASSISTED) {
    const assistance = Number(set.assistance ?? set.weight ?? 0)
    return assistance > 0
      ? `${assistance} lb assist × ${reps}`
      : `Assist × ${reps}`
  }

  const weight = Number(set.weight ?? 0)
  if (weight > 0 && reps > 0) return `${weight} × ${reps}`
  if (reps > 0) return `${reps} reps`
  return '—'
}

const formatLegacyCompletedSetDisplay = (set: Record<string, unknown> = {}) => {
  if (set.loadType) return formatCompletedSetDisplay(set)

  const weight = Number(set.weight ?? 0)
  const reps = Number(set.reps ?? 0)
  if (weight > 0 && reps > 0) return `${weight} × ${reps}`
  if (reps > 0 && weight === 0) return `${reps} reps`
  return '—'
}

const mapTrustedCompletedSet = (set: Record<string, unknown> = {}) => ({
  exercise: set.exercise ?? null,
  muscle: set.muscle ?? null,
  loadType: resolveSetLoadType(set, set.loadType),
  reps: Number(set.reps ?? 0) || null,
  display: set.loadType
    ? formatCompletedSetDisplay(set)
    : formatLegacyCompletedSetDisplay(set),
})

const mapTrustedSessionSets = (
  session: Record<string, unknown>,
  limit = 12,
) =>
  ((session.sets as Array<Record<string, unknown>> | undefined) ?? [])
    .slice(0, limit)
    .map(mapTrustedCompletedSet)

const todayKey = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 10)

const formatWorkoutName = (name: string | null | undefined) => {
  if (!name) return null
  return String(name).replace(/\s*\+\s*/g, ' & ')
}

const sessionDate = (session: Record<string, unknown>) =>
  (session?.finishedAt as string | undefined) ??
  (session?.date ? `${session.date}T12:00:00` : null)

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const normalizeRating = (value: unknown, fallback = 3) =>
  clamp(Number(value || fallback), 1, 5)

const readinessEntryForDate = (
  readinessState: { entries?: Array<Record<string, unknown>> },
  date = new Date(),
) => {
  const key = todayKey(date)
  return (
    readinessState.entries?.find(
      (entry) => entry.date === key,
    ) ?? null
  )
}

const scoreFromEntry = (entry: Record<string, unknown> | null) => {
  if (!entry) return null

  const sleep = normalizeRating(entry.sleep)
  const energy = normalizeRating(entry.energy)
  const sorenessRecovery = 6 - normalizeRating(entry.soreness)
  const stressRecovery = 6 - normalizeRating(entry.stress)

  return Math.round(
    ((sleep * 0.32 +
      energy * 0.32 +
      sorenessRecovery * 0.2 +
      stressRecovery * 0.16) /
      5) *
      100,
  )
}

const calculateReadiness = (
  state: Record<string, unknown> = {},
  date = new Date(),
) => {
  const entry = readinessEntryForDate(
    (state.readiness as { entries?: Array<Record<string, unknown>> }) ?? {},
    date,
  )

  if (!entry) {
    return { completed: false, score: null, status: null, factors: [] }
  }

  const subjectiveScore = scoreFromEntry(entry) ?? 0
  const score = clamp(subjectiveScore, 0, 100)

  let status = 'Recovery recommended'
  if (score >= 82) status = 'Ready to push'
  else if (score >= 65) status = 'Ready to train'
  else if (score >= 48) status = 'Use a lighter approach'

  const factors = [
    {
      label: 'Sleep',
      value: entry.sleep,
      concern: normalizeRating(entry.sleep) <= 2,
    },
    {
      label: 'Energy',
      value: entry.energy,
      concern: normalizeRating(entry.energy) <= 2,
    },
    {
      label: 'Soreness',
      value: entry.soreness,
      concern: normalizeRating(entry.soreness) >= 4,
    },
    {
      label: 'Stress',
      value: entry.stress,
      concern: normalizeRating(entry.stress) >= 4,
    },
  ]

  return { completed: true, score, status, factors }
}

const assignmentDisplayName = (assignment: Record<string, unknown> | null) => {
  const payload = assignment?.workout_payload as
    | { name?: string }
    | undefined
  return payload?.name ?? (assignment?.title as string | undefined) ?? null
}

const resolveActiveCoachAssignment = (
  assignments: Array<Record<string, unknown>> = [],
) => {
  const active = [...assignments]
    .filter((item) => ACTIVE_STATUSES.includes(String(item.status)))
    .sort((a, b) =>
      String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')),
    )

  if (!active.length) return null
  return active.find((item) => item.status === 'started') ?? active[0]
}

const resolveTrustedWorkout = (
  foundryState: Record<string, unknown>,
  activeAssignment: Record<string, unknown> | null,
  now = new Date(),
) => {
  const scheduled =
    (foundryState.weeklySchedule as string[] | undefined)?.[now.getDay()] ??
    null
  const isRestDay = scheduled === 'Rest'

  const activeWorkout = foundryState.activeWorkout as
    | { name?: string }
    | undefined

  if (activeWorkout?.name) {
    return {
      name: activeWorkout.name,
      source: 'active',
      coachAssigned: Boolean(
        (activeWorkout as { assignmentId?: string }).assignmentId,
      ),
      isRestDay: false,
      assignment: null,
    }
  }

  if (activeAssignment) {
    const assignmentName = assignmentDisplayName(activeAssignment)
    if (assignmentName) {
      return {
        name: assignmentName,
        source: 'coach-assignment',
        coachAssigned: true,
        isRestDay: false,
        assignment: activeAssignment,
      }
    }
  }

  const program = foundryState.program as
    | { nextWorkout?: string; workouts?: Record<string, unknown> }
    | undefined

  const name =
    (foundryState.selectedWorkout as string | undefined) ||
    (scheduled && scheduled !== 'Rest' ? scheduled : null) ||
    program?.nextWorkout ||
    null

  let source = 'none'
  if (name) {
    if (foundryState.selectedWorkout === name) source = 'selected'
    else if (scheduled && scheduled !== 'Rest' && name === scheduled) {
      source = 'scheduled'
    } else if (program?.nextWorkout === name) source = 'program'
    else source = 'selected'
  }

  return {
    name,
    source,
    coachAssigned: false,
    isRestDay: isRestDay && !name,
    assignment: null,
  }
}

const resolveWorkoutExercises = (
  foundryState: Record<string, unknown>,
  workoutName: string | null,
  assignment: Record<string, unknown> | null,
) => {
  const payload = assignment?.workout_payload as
    | { exercises?: Array<Record<string, unknown>> }
    | undefined

  if (payload?.exercises?.length) {
    return payload.exercises
      .slice(0, MAX_EXERCISES)
      .map((item) => mapTrustedExercise(item))
  }

  const program = foundryState.program as
    | { workouts?: Record<string, Array<Record<string, unknown>>> }
    | undefined

  const programExercises = workoutName
    ? program?.workouts?.[workoutName]
    : null

  if (Array.isArray(programExercises) && programExercises.length) {
    return programExercises
      .slice(0, MAX_EXERCISES)
      .map((item) => mapTrustedExercise(item))
  }

  return []
}

const buildTrustedRecovery = (
  foundryState: Record<string, unknown>,
  now = new Date(),
) => {
  const key = todayKey(now)
  const mobility = (foundryState.mobility as
    | { completed?: Array<{ flowId?: string; completedAt?: string }> }
    | undefined)?.completed ?? []

  const mobilityCompletedToday = (flowId?: string) =>
    mobility.some((item) => {
      const date = String(item?.completedAt ?? '').slice(0, 10)
      return date === key && (!flowId || item?.flowId === flowId)
    })

  const history = (foundryState.history as Array<Record<string, unknown>>) ?? []
  const workoutsThisWeek = history.filter((session) => {
    const value = sessionDate(session)
    const time = new Date(String(value)).getTime()
    return Number.isFinite(time) && now.getTime() - time <= 7 * DAY_MS
  }).length

  return {
    trust: 'server-trusted',
    mobilityResetDone: mobilityCompletedToday('daily-reset'),
    recoveryFlowDone: mobilityCompletedToday('recovery-flow'),
    workoutsThisWeek,
  }
}

const buildTrustedRecentTraining = (
  foundryState: Record<string, unknown>,
  now = new Date(),
) => {
  const history = ((foundryState.history as Array<Record<string, unknown>>) ??
    []).filter((session) => Array.isArray(session.sets))

  const recent = history
    .filter((session) => {
      const value = sessionDate(session)
      const time = new Date(String(value)).getTime()
      return Number.isFinite(time) && now.getTime() - time <= 7 * DAY_MS
    })
    .sort((a, b) =>
      String(sessionDate(a)).localeCompare(String(sessionDate(b))),
    )

  const lastSession = recent.at(-1) ?? null

  return {
    trust: 'server-trusted',
    recentSessionCount: recent.length,
    lastSessionName: (lastSession?.name as string | undefined) ?? null,
    lastSessionDate: lastSession
      ? String(sessionDate(lastSession)).slice(0, 10)
      : null,
    lastSessionSets: lastSession ? mapTrustedSessionSets(lastSession) : [],
    recentSessions: recent.slice(-MAX_RECENT_SESSIONS).map((session) => ({
      name: (session.name as string | undefined) ?? null,
      date: String(sessionDate(session)).slice(0, 10),
      sets: mapTrustedSessionSets(session, 8),
    })),
  }
}

const buildTrustedSchedule = (
  appointments: Array<Record<string, unknown>> = [],
) => {
  const upcoming = appointments
    .filter((item) => String(item.status ?? 'scheduled') === 'scheduled')
    .sort((a, b) =>
      String(a.starts_at ?? '').localeCompare(String(b.starts_at ?? '')),
    )
    .slice(0, 5)
    .map((item) => ({
      id: item.id ?? null,
      startsAt: item.starts_at ?? null,
      endsAt: item.ends_at ?? null,
      sessionDate: item.session_date ?? null,
      startTime: item.start_time ?? null,
      durationMinutes: item.duration_minutes ?? null,
      coachDisplayName: item.coach_display_name ?? 'Coach',
      rsvpStatus: item.rsvp_status ?? null,
      appointmentType: item.appointment_type ?? 'IN_PERSON_TRAINING',
      locationType: item.location_type ?? null,
      locationName: item.location_name ?? null,
      linkedWorkoutTitle: item.linked_workout_title ?? null,
    }))

  return {
    trust: 'server-trusted',
    upcomingCount: upcoming.length,
    nextAppointment: upcoming[0] ?? null,
    upcoming,
  }
}

const buildTrustedWeeklyCheckIn = (
  row: Record<string, unknown> | null,
) => {
  if (!row) {
    return {
      trust: 'server-trusted',
      hasSubmission: false,
      latest: null,
    }
  }

  return {
    trust: 'server-trusted',
    hasSubmission: true,
    latest: {
      weekStart: row.week_start ?? null,
      weekEnd: row.week_end ?? null,
      submittedAt: row.submitted_at ?? null,
      trainingRating: Number(row.training_rating ?? 0) || null,
      recoveryRating: Number(row.recovery_rating ?? 0) || null,
      nutritionRating: Number(row.nutrition_rating ?? 0) || null,
      painOrIssue: row.pain_or_issue ?? null,
      weeklyWin: row.weekly_win ?? null,
      status: row.status ?? null,
    },
  }
}

const sumWorkoutActivityCalories = (day: Record<string, unknown> | null) => {
  const activities = Array.isArray(day?.workoutActivities)
    ? (day?.workoutActivities as Array<Record<string, unknown>>)
    : []

  if (activities.length) {
    return activities.reduce(
      (sum, item) => sum + Math.max(0, Number(item.activeCalories ?? 0)),
      0,
    )
  }

  return Math.max(0, Number(day?.workoutCalories ?? 0))
}

const buildTrustedNutrition = ({
  nutritionProfile,
  nutritionDay,
  foundryState,
  now = new Date(),
}: {
  nutritionProfile: Record<string, unknown> | null
  nutritionDay: Record<string, unknown> | null
  foundryState: Record<string, unknown>
  now?: Date
}) => {
  const goals =
    (nutritionProfile?.goals as Record<string, unknown> | undefined) ??
    ((foundryState.nutrition as { goals?: Record<string, unknown> } | undefined)
      ?.goals ?? { calories: 2200, protein: 170 })

  const nutritionState =
    (foundryState.nutrition as {
      days?: Record<string, Record<string, unknown>>
    } | undefined) ?? {}

  const daySnapshot =
    (nutritionDay?.snapshot as Record<string, unknown> | undefined) ??
    nutritionState.days?.[todayKey(now)] ??
    null

  const foods = Array.isArray(daySnapshot?.foods)
    ? (daySnapshot?.foods as Array<Record<string, unknown>>)
    : []

  const totals = foods.reduce(
    (
      acc: {
        calories: number
        protein: number
        carbs: number
        fat: number
        fiber: number
      },
      food,
    ) => ({
      calories: acc.calories + Number(food.calories || 0),
      protein: acc.protein + Number(food.protein || 0),
      carbs: acc.carbs + Number(food.carbs || 0),
      fat: acc.fat + Number(food.fat || 0),
      fiber: acc.fiber + Number(food.fiber || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  )

  const hasLoggedFood = foods.length > 0
  const proteinGoal = Number(goals.protein ?? 0) || null
  const calorieGoal = Number(goals.calories ?? 0) || null
  const activeCalories = sumWorkoutActivityCalories(daySnapshot)
  const effectiveCalorieBudget =
    calorieGoal == null ? null : Math.round(calorieGoal + activeCalories)

  const recentDays = Object.values(nutritionState.days ?? {})
    .filter((day) => day?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-14)

  const recentWeights = recentDays
    .filter((day) => Number(day.weight) > 0)
    .map((day) => ({
      date: String(day.date),
      weight: Number(day.weight),
    }))

  const loggedNutritionDays = recentDays.filter(
    (day) => Array.isArray(day.foods) && day.foods.length > 0,
  ).length

  const adaptation =
    goals.adaptation && typeof goals.adaptation === 'object'
      ? (goals.adaptation as Record<string, unknown>)
      : null
  const adaptationHistory = Array.isArray(adaptation?.history)
    ? (adaptation?.history as Array<Record<string, unknown>>).slice(-5)
    : []

  return {
    trust: 'server-trusted',
    hasLoggedFood,
    calories: hasLoggedFood ? Math.round(totals.calories) : null,
    calorieGoal,
    activeCalories: Math.round(activeCalories),
    effectiveCalorieBudget,
    protein: hasLoggedFood ? Math.round(totals.protein) : null,
    proteinGoal,
    carbs: hasLoggedFood ? Math.round(totals.carbs) : null,
    carbsGoal: Number(goals.carbs ?? 0) || null,
    fat: hasLoggedFood ? Math.round(totals.fat) : null,
    fatGoal: Number(goals.fat ?? 0) || null,
    fiber: hasLoggedFood ? Math.round(totals.fiber) : null,
    fiberGoal: Number(goals.fiber ?? 0) || null,
    waterOz: Number(daySnapshot?.waterOz ?? 0),
    waterGoalOz: Number(goals.waterOz ?? 0) || null,
    weightToday: Number(daySnapshot?.weight ?? 0) || null,
    goalType:
      (goals.inputs as Record<string, unknown> | undefined)?.goal ?? null,
    configured: Boolean(goals.configured),
    source: goals.source ?? null,
    proteinProgress:
      hasLoggedFood && proteinGoal && proteinGoal > 0
        ? Math.round((totals.protein / proteinGoal) * 100)
        : null,
    recent14Days: {
      loggedNutritionDays,
      weighIns: recentWeights.length,
      weights: recentWeights,
    },
    adaptation: adaptation
      ? {
          enabled: Boolean(adaptation.enabled),
          lastAppliedAt: adaptation.lastAppliedAt ?? null,
          lastAdjustmentCalories:
            Number(adaptation.lastAdjustmentCalories ?? 0) || 0,
          lastObservedPercentPerWeek:
            Number(adaptation.lastObservedPercentPerWeek ?? 0) || null,
          history: adaptationHistory.map((item) => ({
            appliedAt: item.appliedAt ?? null,
            previousCalories: Number(item.previousCalories ?? 0) || null,
            nextCalories: Number(item.nextCalories ?? 0) || null,
            adjustmentCalories:
              Number(item.adjustmentCalories ?? 0) || 0,
            percentPerWeek:
              Number(item.percentPerWeek ?? 0) || null,
            adherence: Number(item.adherence ?? 0) || null,
          })),
        }
      : null,
  }
}

const buildTrustedProgress = (
  foundryState: Record<string, unknown>,
  now = new Date(),
) => {
  const history = ((foundryState.history as Array<Record<string, unknown>>) ?? [])
    .filter((session) => Array.isArray(session?.sets))
    .sort((a, b) =>
      String(sessionDate(a)).localeCompare(String(sessionDate(b))),
    )

  const withinDays = (session: Record<string, unknown>, days: number) => {
    const time = new Date(String(sessionDate(session))).getTime()
    return Number.isFinite(time) && now.getTime() - time <= days * DAY_MS
  }

  const recent7 = history.filter((session) => withinDays(session, 7))
  const recent30 = history.filter((session) => withinDays(session, 30))
  const last = history.at(-1) ?? null

  const nutritionDays =
    ((foundryState.nutrition as {
      days?: Record<string, Record<string, unknown>>
    } | undefined)?.days ?? {})

  const weights = Object.values(nutritionDays)
    .filter((day) => day?.date && Number(day.weight) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-14)
    .map((day) => ({
      date: String(day.date),
      weight: Number(day.weight),
    }))

  return {
    trust: 'server-trusted',
    totalRecordedSessions: history.length,
    sessionsLast7Days: recent7.length,
    sessionsLast30Days: recent30.length,
    lastSession: last
      ? {
          name: last.name ?? null,
          date: String(sessionDate(last)).slice(0, 10),
          sets: mapTrustedSessionSets(last, 8),
        }
      : null,
    weightTrend: {
      latest: weights.at(-1) ?? null,
      earliestInWindow: weights[0] ?? null,
      recent: weights,
    },
  }
}


export const resolveAuthenticatedUserId = (
  authenticatedUserId: string,
  body: Record<string, unknown> = {},
) => {
  const spoofed =
    body.userId ??
    body.user_id ??
    body.athleteId ??
    body.athlete_id ??
    body.clientId ??
    body.client_id ??
    null

  return {
    userId: authenticatedUserId,
    rejectedSpoofedIdentity:
      Boolean(spoofed) && String(spoofed) !== String(authenticatedUserId),
  }
}

export const extractSessionContext = (body: Record<string, unknown> = {}) => {
  const conversation =
    (body.sessionContext as Record<string, unknown> | undefined) ??
    (body.conversation as Record<string, unknown> | undefined) ??
    {}

  return {
    trust: 'user-subjective',
    recentMessages: Array.isArray(conversation.recentMessages)
      ? (conversation.recentMessages as Array<Record<string, unknown>>)
          .slice(-12)
          .map((item) => ({
            role: item.role === 'user' ? 'user' : 'ava',
            text: String(item.text ?? '').slice(0, 1200),
          }))
      : [],
    temporaryConstraints: Array.isArray(conversation.temporaryConstraints)
      ? (conversation.temporaryConstraints as unknown[])
          .slice(0, 4)
          .map((item) => String(item ?? '').slice(0, 400))
      : [],
    userStatements: Array.isArray(conversation.userStatements)
      ? (conversation.userStatements as unknown[])
          .slice(0, 6)
          .map((item) => String(item ?? '').slice(0, 400))
      : [],
    topic: conversation.topic ?? null,
    lastRecommendation: conversation.lastRecommendation
      ? String(conversation.lastRecommendation).slice(0, 1200)
      : null,
  }
}

export const extractClientHints = (body: Record<string, unknown> = {}) => {
  const hints = (body.clientHints as Record<string, unknown> | undefined) ?? {}

  return {
    trust: 'client-hints',
    daypart: hints.daypart ? String(hints.daypart).slice(0, 20) : null,
    timezoneOffset:
      typeof hints.timezoneOffset === 'number' ? hints.timezoneOffset : null,
    advisoryOnly: true,
  }
}

export type TrustedFetchResult = {
  foundryState: Record<string, unknown> | null
  serverAssignments: Array<Record<string, unknown>>
  nutritionProfile: Record<string, unknown> | null
  nutritionDay: Record<string, unknown> | null
  athleteAppointments: Array<Record<string, unknown>>
  weeklyCheckIn: Record<string, unknown> | null
  hasCloudState: boolean
  queryCount: number
}

export async function fetchTrustedAthleteData(
  userClient: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<TrustedFetchResult> {
  const logDate = todayKey(now)

  const [
    foundryResult,
    assignmentsResult,
    nutritionProfileResult,
    nutritionDayResult,
    appointmentsResult,
    weeklyCheckInResult,
  ] = await Promise.all([
      userClient
        .from('foundry_state')
        .select('state')
        .eq('user_id', userId)
        .maybeSingle(),
      userClient
        .from('coach_assignments')
        .select(
          'id, title, workout_payload, coach_notes, due_date, status, athlete_id',
        )
        .eq('athlete_id', userId)
        .in('status', ACTIVE_STATUSES)
        .order('due_date', { ascending: true }),
      userClient
        .from('nutrition_profiles')
        .select('goals, coach_access')
        .eq('user_id', userId)
        .maybeSingle(),
      userClient
        .from('nutrition_days')
        .select('snapshot')
        .eq('user_id', userId)
        .eq('log_date', logDate)
        .maybeSingle(),
      userClient.rpc('list_athlete_scheduled_sessions'),
      userClient
        .from('athlete_weekly_check_ins')
        .select(
          'id, week_start, week_end, submitted_at, training_rating, recovery_rating, nutrition_rating, pain_or_issue, weekly_win, status',
        )
        .eq('athlete_id', userId)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  if (foundryResult.error) {
    console.error('foundry_state fetch failed', foundryResult.error.message)
  }
  if (assignmentsResult.error) {
    console.error('coach_assignments fetch failed', assignmentsResult.error.message)
  }

  const foundryState =
    (foundryResult.data?.state as Record<string, unknown> | undefined) ?? null

  return {
    foundryState,
    serverAssignments: (assignmentsResult.data ??
      []) as Array<Record<string, unknown>>,
    nutritionProfile: (nutritionProfileResult.data as
      | Record<string, unknown>
      | null) ?? null,
    nutritionDay: (nutritionDayResult.data as Record<string, unknown> | null) ??
      null,
    athleteAppointments: (Array.isArray(appointmentsResult.data)
      ? appointmentsResult.data
      : []) as Array<Record<string, unknown>>,
    weeklyCheckIn:
      (weeklyCheckInResult.data as Record<string, unknown> | null) ?? null,
    hasCloudState: Boolean(foundryState),
    queryCount: 6,
  }
}

export function buildTrustedModelContext({
  authenticatedUserId,
  foundryState = null,
  serverAssignments = [],
  nutritionProfile = null,
  nutritionDay = null,
  athleteAppointments = [],
  weeklyCheckIn = null,
  sessionContext = {},
  clientHints = {},
  profileFirstName = null,
  now = new Date(),
  hasCloudState = true,
}: {
  authenticatedUserId: string
  foundryState: Record<string, unknown> | null
  serverAssignments: Array<Record<string, unknown>>
  nutritionProfile: Record<string, unknown> | null
  nutritionDay: Record<string, unknown> | null
  athleteAppointments: Array<Record<string, unknown>>
  weeklyCheckIn: Record<string, unknown> | null
  sessionContext: ReturnType<typeof extractSessionContext>
  clientHints: ReturnType<typeof extractClientHints>
  profileFirstName?: string | null
  now?: Date
  hasCloudState?: boolean
}) {
  const state = foundryState ?? {}
  const activeAssignment = resolveActiveCoachAssignment(serverAssignments)
  const workout = resolveTrustedWorkout(state, activeAssignment, now)
  const exercises = resolveWorkoutExercises(
    state,
    workout.name,
    workout.assignment,
  )
  const readiness = calculateReadiness(state, now)

  const sanitizedAssignment = activeAssignment
    ? {
        id: activeAssignment.id,
        title: activeAssignment.title ?? assignmentDisplayName(activeAssignment),
        workoutName: assignmentDisplayName(activeAssignment),
        athleteNotes: activeAssignment.coach_notes ?? null,
        exercises,
      }
    : null

  return {
    athlete: {
      firstName: profileFirstName ?? null,
    },
    serverFacts: {
      authenticatedUserId,
      trustedToday: {
        trust: 'server-trusted',
        source: hasCloudState ? 'cloud-sync' : 'unverified-local-only',
        canonicalWorkout: workout.name ?? null,
        canonicalWorkoutFormatted: formatWorkoutName(workout.name),
        workoutSource: workout.source,
        coachAssigned: Boolean(workout.coachAssigned),
        isRestDay: Boolean(workout.isRestDay),
        isActiveWorkout: Boolean(
          (state.activeWorkout as { name?: string } | undefined)?.name,
        ),
        activeWorkoutName:
          (state.activeWorkout as { name?: string } | undefined)?.name ?? null,
        exercises,
        readiness: {
          trust: 'server-trusted',
          completed: readiness.completed,
          score: readiness.score,
          status: readiness.status,
          factors: readiness.factors,
        },
        recovery: buildTrustedRecovery(state, now),
        coachAssignment: sanitizedAssignment,
      },
      recentTraining: buildTrustedRecentTraining(state, now),
      nutrition: buildTrustedNutrition({
        nutritionProfile,
        nutritionDay,
        foundryState: state,
        now,
      }),
      schedule: buildTrustedSchedule(athleteAppointments),
      weeklyCheckIn: buildTrustedWeeklyCheckIn(weeklyCheckIn),
      progress: buildTrustedProgress(state, now),
    },
    sessionContext,
    clientHints,
  }
}

export function buildModelPayload({
  message = '',
  trustedContext = {},
}: {
  message?: string
  trustedContext: Record<string, unknown>
}) {
  return JSON.stringify(
    {
      athleteMessage: String(message ?? '').trim().slice(0, 2000),
      avarenContext: trustedContext,
    },
    null,
    0,
  )
}
