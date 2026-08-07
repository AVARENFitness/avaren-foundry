const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'started']

const todayKey = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 10)

/**
 * Returns the athlete's current active coach assignment.
 * Matches AthleteAssignmentHome / clientIntelligence activeAssignment:
 * earliest due date among assigned/started workouts, with started taking precedence.
 */
export const resolveActiveCoachAssignment = (
  assignments = [],
  now = new Date(),
) => {
  const active = [...assignments]
    .filter((item) =>
      ACTIVE_ASSIGNMENT_STATUSES.includes(item?.status),
    )
    .sort((a, b) =>
      String(a?.due_date ?? '9999').localeCompare(
        String(b?.due_date ?? '9999'),
      ),
    )

  if (!active.length) return null

  return active.find((item) => item.status === 'started') ?? active[0]
}

export const isActiveCoachAssignment = (assignment) =>
  Boolean(
    assignment &&
      ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status),
  )

export const assignmentDisplayName = (assignment) =>
  assignment?.workout_payload?.name ??
  assignment?.title ??
  null

export const resolveCoachAssignmentForToday = (
  assignments = [],
  now = new Date(),
) => {
  const active = resolveActiveCoachAssignment(assignments, now)
  if (!active) return null

  const name = assignmentDisplayName(active)
  if (!name) return null

  return {
    ...active,
    displayName: name,
    scheduledFor: active.due_date ?? active.scheduled_date ?? null,
    isOverdue:
      Boolean(active.due_date) && active.due_date < todayKey(now),
    isDueToday: active.due_date === todayKey(now),
  }
}

/** @deprecated Prefer resolveActiveCoachAssignment — exact today match only. */
export const assignmentDueToday = (assignments = [], now = new Date()) => {
  const key = todayKey(now)
  return (
    assignments.find(
      (item) =>
        isActiveCoachAssignment(item) &&
        (item?.due_date === key || item?.scheduled_date === key),
    ) ?? null
  )
}
