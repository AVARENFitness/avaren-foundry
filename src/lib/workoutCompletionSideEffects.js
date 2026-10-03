const QUEUE_PREFIX = 'avaren-workout-completion-side-effects'

export const COMPLETION_SIDE_EFFECT = {
  ASSIGNMENT_COMPLETE: 'assignment_complete',
  APPOINTMENT_LINK: 'appointment_link',
}

const queueKey = (athleteId) =>
  `${QUEUE_PREFIX}:${String(athleteId)}`

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

const itemKey = (item = {}) =>
  [
    item.type ?? '',
    item.assignmentId ?? '',
    item.scheduledSessionId ?? '',
    item.workoutSessionId ?? '',
  ].join(':')

export const listQueuedWorkoutCompletionSideEffects = (athleteId) =>
  readQueue(athleteId)

export const enqueueWorkoutCompletionSideEffects = (
  athleteId,
  {
    assignmentId = null,
    scheduledSessionId = null,
    workoutSessionId = null,
    completionSummary = null,
    completedAt = null,
  } = {},
) => {
  if (!athleteId || !workoutSessionId) return []

  const additions = []

  if (assignmentId) {
    additions.push({
      type: COMPLETION_SIDE_EFFECT.ASSIGNMENT_COMPLETE,
      assignmentId,
      workoutSessionId,
      completionSummary: completionSummary ?? {},
      completedAt,
    })
  }

  if (scheduledSessionId) {
    additions.push({
      type: COMPLETION_SIDE_EFFECT.APPOINTMENT_LINK,
      scheduledSessionId,
      workoutSessionId,
    })
  }

  if (!additions.length) return []

  const byKey = new Map(
    readQueue(athleteId).map((item) => [itemKey(item), item]),
  )

  additions.forEach((item) => {
    byKey.set(itemKey(item), item)
  })

  const next = [...byKey.values()]
  writeQueue(athleteId, next)
  return additions
}

export const clearQueuedWorkoutCompletionSideEffect = (
  athleteId,
  item,
) => {
  const key = itemKey(item)
  writeQueue(
    athleteId,
    readQueue(athleteId).filter((queued) => itemKey(queued) !== key),
  )
}

export async function flushWorkoutCompletionSideEffects(
  athleteId,
  {
    markAssignmentCompleted,
    linkAppointmentWorkout,
  } = {},
) {
  if (!athleteId) return { flushed: 0, remaining: 0 }

  const queue = readQueue(athleteId)
  let flushed = 0

  for (const item of queue) {
    try {
      if (item.type === COMPLETION_SIDE_EFFECT.ASSIGNMENT_COMPLETE) {
        if (typeof markAssignmentCompleted !== 'function') break
        await markAssignmentCompleted(
          item.assignmentId,
          item.workoutSessionId,
          {
            ...(item.completionSummary ?? {}),
            completedAt: item.completedAt ?? null,
          },
        )
      } else if (item.type === COMPLETION_SIDE_EFFECT.APPOINTMENT_LINK) {
        if (typeof linkAppointmentWorkout !== 'function') break
        await linkAppointmentWorkout(
          item.scheduledSessionId,
          item.workoutSessionId,
        )
      } else {
        clearQueuedWorkoutCompletionSideEffect(athleteId, item)
        continue
      }

      clearQueuedWorkoutCompletionSideEffect(athleteId, item)
      flushed += 1
    } catch (error) {
      console.error('Workout completion side-effect flush failed:', error)
      break
    }
  }

  return {
    flushed,
    remaining: readQueue(athleteId).length,
  }
}
