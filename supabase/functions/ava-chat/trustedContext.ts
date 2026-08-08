import { createClient, SupabaseClient } from '@supabase/supabase-js'

const MAX_EXERCISES = 8
const MAX_RECENT_SESSIONS = 5
const DAY_MS = 86400000
const ACTIVE_STATUSES = ['assigned', 'started']

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
    return payload.exercises.slice(0, MAX_EXERCISES).map((item) => ({
      name: item.name ?? item.exercise ?? 'Exercise',
      sets: item.sets ?? null,
      muscle: item.muscle ?? null,
    }))
  }

  const program = foundryState.program as
    | { workouts?: Record<string, Array<Record<string, unknown>>> }
    | undefined

  const programExercises = workoutName
    ? program?.workouts?.[workoutName]
    : null

  if (Array.isArray(programExercises) && programExercises.length) {
    return programExercises.slice(0, MAX_EXERCISES).map((item) => ({
      name: item.name ?? item.exercise ?? 'Exercise',
      sets: item.sets ?? null,
      muscle: item.muscle ?? null,
    }))
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
    recentSessions: recent.slice(-MAX_RECENT_SESSIONS).map((session) => ({
      name: (session.name as string | undefined) ?? null,
      date: String(sessionDate(session)).slice(0, 10),
    })),
  }
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
  const goals = (nutritionProfile?.goals as Record<string, unknown> | undefined) ??
    ((foundryState.nutrition as { goals?: Record<string, unknown> } | undefined)
      ?.goals ?? { calories: 2200, protein: 170 })

  const daySnapshot =
    (nutritionDay?.snapshot as { foods?: Array<unknown> } | undefined) ??
    ((foundryState.nutrition as { days?: Record<string, { foods?: Array<unknown> }> })
      ?.days?.[todayKey(now)] ?? null)

  const foods = daySnapshot?.foods ?? []
  const totals = foods.reduce(
    (acc: { calories: number; protein: number }, food) => {
      const item = food as { calories?: number; protein?: number }
      return {
        calories: acc.calories + Number(item.calories || 0),
        protein: acc.protein + Number(item.protein || 0),
      }
    },
    { calories: 0, protein: 0 },
  )

  const hasLoggedFood = foods.length > 0
  const proteinGoal = Number(goals.protein ?? 170)
  const calorieGoal = Number(goals.calories ?? 2200)

  return {
    trust: 'server-trusted',
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
  hasCloudState: boolean
  queryCount: number
}

export async function fetchTrustedAthleteData(
  userClient: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<TrustedFetchResult> {
  const logDate = todayKey(now)

  const [foundryResult, assignmentsResult, nutritionProfileResult, nutritionDayResult] =
    await Promise.all([
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
    hasCloudState: Boolean(foundryState),
    queryCount: 4,
  }
}

export function buildTrustedModelContext({
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
}: {
  authenticatedUserId: string
  foundryState: Record<string, unknown> | null
  serverAssignments: Array<Record<string, unknown>>
  nutritionProfile: Record<string, unknown> | null
  nutritionDay: Record<string, unknown> | null
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
