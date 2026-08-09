import { PROGRAMMING_OWNER } from './planOwnership'

export const PRIORITY_MODE = {
  FULL_SESSION: 'full_session',
  MAIN_WORK: 'main_work',
  MINIMUM_EFFECTIVE: 'minimum_effective_session',
}

export const ACCESSORIES_POLICY = {
  KEEP_ALL: 'keep_all',
  TRIM_IF_NEEDED: 'trim_if_needed',
}

export const EXECUTION_PLAN_SOURCE = {
  AVA_PLAN: 'ava_plan',
  MANUAL: 'manual',
}

const isoDate = (value = new Date()) =>
  new Date(value).toISOString().slice(0, 10)

const endOfDayIso = (value = new Date()) => {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

const isAccessoryExercise = (exercise = {}, index = 0, total = 0) => {
  const name = String(exercise.name ?? '').toLowerCase()
  if (/curl|extension|raise|flye|fly|crunch|plank|carry|face pull|lateral/.test(name)) {
    return true
  }
  return index >= Math.max(2, total - 2) && total > 3
}

export const resolvePriorityMode = (maxMinutes = null) => {
  if (maxMinutes == null) return PRIORITY_MODE.FULL_SESSION
  if (maxMinutes <= 20) return PRIORITY_MODE.MINIMUM_EFFECTIVE
  if (maxMinutes <= 35) return PRIORITY_MODE.MAIN_WORK
  return PRIORITY_MODE.FULL_SESSION
}

export const deriveExercisePriority = ({
  exercises = [],
  maxMinutes = null,
  priorityMode = null,
} = {}) => {
  const list = Array.isArray(exercises) ? exercises : []
  if (!list.length) {
    return {
      priorityExerciseNames: [],
      accessoryExerciseNames: [],
      priorityMode: PRIORITY_MODE.FULL_SESSION,
    }
  }

  const mode = priorityMode ?? resolvePriorityMode(maxMinutes)
  const total = list.length

  if (mode === PRIORITY_MODE.FULL_SESSION) {
    return {
      priorityExerciseNames: list.map((item) => item.name).filter(Boolean),
      accessoryExerciseNames: [],
      priorityMode: mode,
    }
  }

  const priorityCount =
    mode === PRIORITY_MODE.MINIMUM_EFFECTIVE
      ? Math.min(2, total)
      : Math.min(Math.max(2, total - 2), total)

  const priorityExerciseNames = list
    .slice(0, priorityCount)
    .map((item) => item.name)
    .filter(Boolean)

  const accessoryExerciseNames = list
    .slice(priorityCount)
    .map((item) => item.name)
    .filter(Boolean)

  const heuristicAccessories = list
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => isAccessoryExercise(item, index, total))
    .map(({ item }) => item.name)
    .filter(Boolean)

  return {
    priorityExerciseNames,
    accessoryExerciseNames: [
      ...new Set([...accessoryExerciseNames, ...heuristicAccessories]),
    ].filter((name) => !priorityExerciseNames.includes(name)),
    priorityMode: mode,
  }
}

export const createSessionExecutionPlan = ({
  workoutId = null,
  workoutName = null,
  date = null,
  maxMinutes = null,
  priorityMode = null,
  exercises = [],
  programmingOwner = PROGRAMMING_OWNER.ATHLETE,
  coachAssigned = false,
  source = EXECUTION_PLAN_SOURCE.AVA_PLAN,
  now = new Date(),
} = {}) => {
  const resolvedMode = priorityMode ?? resolvePriorityMode(maxMinutes)
  const priority = deriveExercisePriority({
    exercises,
    maxMinutes,
    priorityMode: resolvedMode,
  })

  return {
    workoutId: workoutId ?? workoutName,
    workoutName,
    date: date ?? isoDate(now),
    maxMinutes,
    priorityMode: priority.priorityMode,
    accessoriesPolicy:
      priority.accessoryExerciseNames.length > 0
        ? ACCESSORIES_POLICY.TRIM_IF_NEEDED
        : ACCESSORIES_POLICY.KEEP_ALL,
    priorityExerciseNames: priority.priorityExerciseNames,
    accessoryExerciseNames: priority.accessoryExerciseNames,
    programmingOwner,
    coachAssigned: Boolean(coachAssigned),
    source,
    createdAt: new Date(now).toISOString(),
    expiresAt: endOfDayIso(now),
  }
}

export const isExecutionPlanCurrent = (plan = null, now = new Date()) => {
  if (!plan?.date) return false
  if (plan.date !== isoDate(now)) return false
  if (plan.expiresAt && new Date(plan.expiresAt).getTime() < now.getTime()) {
    return false
  }
  return true
}

export const clearExpiredExecutionPlan = (plan = null, now = new Date()) =>
  isExecutionPlanCurrent(plan, now) ? plan : null

export const executionPlanSummaryLabel = (plan = null) => {
  if (!plan?.maxMinutes) return null
  return `${plan.maxMinutes}-min focus`
}

export const exerciseExecutionRole = (plan = null, exerciseName = '') => {
  if (!plan || !exerciseName) return 'standard'
  if (plan.priorityExerciseNames?.includes(exerciseName)) return 'priority'
  if (plan.accessoryExerciseNames?.includes(exerciseName)) return 'accessory'
  return 'standard'
}

export const attachExecutionMetadataToSession = (session = {}, plan = null) => {
  if (!session || !plan) return session

  return {
    ...session,
    executionMetadata: {
      programmedScope: 'full_session',
      executionFocus: plan.maxMinutes
        ? `${plan.maxMinutes}-min ${plan.priorityMode}`
        : plan.priorityMode,
      priorityMode: plan.priorityMode,
      coachProgramPreserved: plan.coachAssigned === true,
    },
  }
}
