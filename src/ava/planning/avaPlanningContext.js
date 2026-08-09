import { buildTrainingWeek, startOfWeekSunday } from '../../lib/trainingWeek'
import { resolveTodayWorkoutContext, WORKOUT_SOURCE } from '../../lib/todayWorkout'
import { buildPlanningOwnership } from '../../lib/planOwnership'
import { CONSTRAINT_SOURCE, CONSTRAINT_TYPES, DAY_STATUS } from './avaPlanTypes'

const isoDate = (value = new Date()) =>
  new Date(value).toISOString().slice(0, 10)

const weekStartKey = (now = new Date()) => isoDate(startOfWeekSunday(now))

const latestReadiness = (readiness = {}) => {
  const entries = readiness?.entries ?? []
  if (!entries.length) return null
  return [...entries].sort((a, b) =>
    String(b.date ?? '').localeCompare(String(a.date ?? '')),
  )[0]
}

const summarizeReadiness = (entry) => {
  if (!entry) return null
  const values = [entry.sleep, entry.energy, entry.soreness, entry.stress].filter(
    (value) => typeof value === 'number',
  )
  if (!values.length) return null
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  if (average >= 3.5) return 'supports_training'
  if (average <= 2.5) return 'caution'
  return 'moderate'
}

export const snapshotWeeklySchedule = (weeklySchedule = {}) =>
  JSON.stringify(weeklySchedule ?? {})

export const buildPlanSnapshot = ({
  weeklySchedule = {},
  now = new Date(),
  assignmentId = null,
} = {}) => ({
  weekStart: weekStartKey(now),
  weeklyScheduleHash: snapshotWeeklySchedule(weeklySchedule),
  assignmentId,
  capturedAt: new Date(now).toISOString(),
})

const resolveWorkoutExercises = (state = {}, todayWorkout = {}, assignment = null) => {
  const fromPayload = assignment?.workout_payload?.exercises
  const fromSanitized = assignment?.exercises
  const exerciseList =
    fromPayload?.length ? fromPayload : fromSanitized?.length ? fromSanitized : null

  if (exerciseList?.length) {
    return exerciseList.map((item) => ({
      name: item.name ?? item.exercise ?? 'Exercise',
      sets: item.sets ?? null,
      muscle: item.muscle ?? null,
    }))
  }

  const workoutName = todayWorkout?.name
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

export const buildPlanningContext = ({
  state = {},
  packet = {},
  session = null,
  assignments = [],
  now = new Date(),
  message = '',
} = {}) => {
  const activeAssignment =
    packet?.assignment ??
    assignments.find((item) => ['assigned', 'started'].includes(item.status)) ??
    null

  const planningAssignments = assignments.map((item) => {
    if (item?.workout_payload || item?.due_date || item?.scheduled_date) {
      return item
    }
    return {
      ...item,
      workout_payload: item.workoutName
        ? {
            name: item.workoutName,
            exercises: item.exercises ?? [],
          }
        : { exercises: item.exercises ?? [] },
      due_date: item.dueDate ?? item.due_date ?? null,
    }
  })

  const todayContext = resolveTodayWorkoutContext(state, {
    assignments,
    now,
    activeCoachAssignment: activeAssignment,
  })

  const trainingWeek = buildTrainingWeek(state, now)
  const readinessEntry = latestReadiness(state.readiness ?? packet?.readiness)
  const readinessSummary = summarizeReadiness(readinessEntry)

  const missedDays = trainingWeek.filter((day) => day.status === 'missed')
  const todayDay = trainingWeek.find((day) => day.isToday) ?? null
  const workoutExercises = resolveWorkoutExercises(
    state,
    todayContext,
    activeAssignment ??
      planningAssignments.find((item) =>
        ['assigned', 'started'].includes(item.status),
      ),
  )
  const hasCoachRelationship = Boolean(assignments?.length)
  const ownership = buildPlanningOwnership({
    todayWorkout: todayContext,
    activeAssignment,
    hasCoachRelationship,
  })

  const persistedExecutionPlan =
    state.sessionExecutionPlan ??
    session?.sessionExecutionPlan ??
    null

  return {
    now,
    todayKey: isoDate(now),
    weekStart: weekStartKey(now),
    todayWorkout: todayContext,
    trainingWeek,
    weeklySchedule: { ...(state.weeklySchedule ?? {}) },
    program: state.program ?? packet?.program ?? null,
    history: state.history ?? packet?.history ?? [],
    readiness: readinessEntry,
    readinessSummary,
    activeWorkout: state.activeWorkout ?? null,
    assignments: planningAssignments ?? [],
    activeAssignment,
    workoutExercises,
    ownership,
    coachAssignedToday: ownership.coachAssigned === true,
    coachProgramProtected: ownership.coachAssigned === true,
    scheduleControlledByCoach: ownership.scheduleControlledByCoach === true,
    missedDays,
    todayDay,
    sessionConstraints: session?.userConstraints ?? [],
    sessionExecutionPlan: persistedExecutionPlan,
    constraints: [],
    message: String(message ?? '').trim(),
    planSnapshot: buildPlanSnapshot({
      weeklySchedule: state.weeklySchedule,
      now,
      assignmentId: activeAssignment?.id ?? null,
    }),
  }
}

export const attachSessionConstraints = (context = {}, session = null, message = '') => {
  const fromMessage = extractConstraintsFromText(message)
  const fromSession = (session?.userConstraints ?? [])
    .flatMap((text) => extractConstraintsFromText(text))
    .filter(Boolean)

  const merged = [...fromMessage, ...fromSession]
  const seen = new Set()

  const constraints = merged.filter((constraint) => {
    const key = `${constraint.type}:${constraint.value ?? ''}:${constraint.targetDayIndex ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    ...context,
    constraints,
  }
}

export const extractConstraintsFromText = (text = '') => {
  const normalized = String(text ?? '').trim().toLowerCase()
  if (!normalized) return []

  const constraints = []

  const minutesMatch = normalized.match(/\b(?:only have|have|about)?\s*(\d+)\s*minutes?\b/)
  if (minutesMatch) {
    constraints.push({
      type: CONSTRAINT_TYPES.TIME_LIMIT,
      value: Number(minutesMatch[1]),
      source: CONSTRAINT_SOURCE.USER_MESSAGE,
      confidence: 'high',
    })
  }

  if (/\b(traveling|travel|on a trip|away)\b/.test(normalized)) {
    const dayMatch = normalized.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    )
    constraints.push({
      type: CONSTRAINT_TYPES.TRAVEL,
      value: dayMatch?.[1] ?? null,
      source: CONSTRAINT_SOURCE.USER_MESSAGE,
      confidence: dayMatch ? 'high' : 'medium',
    })
  }

  if (/\bmissed yesterday\b|\bi missed\b|\bdidn't train yesterday\b/.test(normalized)) {
    constraints.push({
      type: CONSTRAINT_TYPES.MISSED_SESSION,
      value: 'recent',
      source: CONSTRAINT_SOURCE.USER_MESSAGE,
      confidence: 'high',
    })
  }

  if (/\b(can't train|cannot train|unavailable|won't be able to train)\b/.test(normalized)) {
    const dayMatch = normalized.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    )
    constraints.push({
      type: CONSTRAINT_TYPES.UNAVAILABLE_DAY,
      value: dayMatch?.[1] ?? null,
      source: CONSTRAINT_SOURCE.USER_MESSAGE,
      confidence: dayMatch ? 'high' : 'medium',
    })
  }

  if (/\b(lighter week|make this week lighter|ease up this week|dial back)\b/.test(normalized)) {
    constraints.push({
      type: CONSTRAINT_TYPES.LIGHTER_WEEK,
      value: true,
      source: CONSTRAINT_SOURCE.USER_MESSAGE,
      confidence: 'high',
    })
  }

  if (/\b(make it easier|make this easier|easier today|make today easier)\b/.test(normalized)) {
    constraints.push({
      type: CONSTRAINT_TYPES.EFFORT_PREFERENCE,
      value: 'easier',
      source: CONSTRAINT_SOURCE.USER_MESSAGE,
      confidence: 'high',
    })
  }

  if (/\b(tired|exhausted|sore|not feeling it|low energy)\b/.test(normalized)) {
    constraints.push({
      type: CONSTRAINT_TYPES.SUBJECTIVE_RECOVERY,
      value: normalized,
      source: CONSTRAINT_SOURCE.USER_MESSAGE,
      confidence: 'medium',
    })
  }

  if (/\b(shoulder|knee|back|hip|pain|hurts|sore)\b/.test(normalized)) {
    constraints.push({
      type: CONSTRAINT_TYPES.PAIN_OR_DISCOMFORT,
      value: normalized,
      source: CONSTRAINT_SOURCE.USER_MESSAGE,
      confidence: 'medium',
    })
  }

  return constraints
}

export const dayNameToIndex = (name = '') => {
  const map = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  }
  return map[String(name ?? '').trim().toLowerCase()] ?? null
}

export const mapWeekDayToPlanDay = (day = {}, context = {}) => ({
  date: day.dateKey,
  dayIndex: day.dayIndex,
  dayName: day.dayName,
  assignedSession:
    day.plannedWorkout && day.plannedWorkout !== 'Rest' ? day.plannedWorkout : null,
  proposedSession: null,
  status:
    day.status === 'completed'
      ? DAY_STATUS.COMPLETED
      : day.status === 'missed'
        ? DAY_STATUS.MISSED
        : day.isToday
          ? DAY_STATUS.TODAY
          : day.isRest
            ? DAY_STATUS.REST
            : DAY_STATUS.UPCOMING,
  completed: Boolean(day.completedWorkout),
  coachAssigned:
    context.todayWorkout?.coachAssigned === true &&
    day.dateKey === context.todayKey,
  constraints: [],
  rationale: [],
})

export const buildTrustedPlanningSources = (context = {}) => ({
  hasWeeklySchedule: Object.keys(context.weeklySchedule ?? {}).length > 0,
  hasTodayWorkout: Boolean(context.todayWorkout?.name),
  workoutSource: context.todayWorkout?.source ?? WORKOUT_SOURCE.NONE,
  coachAssignedToday: context.coachAssignedToday === true,
  missedSessionCount: context.missedDays?.length ?? 0,
  readinessSummary: context.readinessSummary,
  constraintCount: context.constraints?.length ?? 0,
})
