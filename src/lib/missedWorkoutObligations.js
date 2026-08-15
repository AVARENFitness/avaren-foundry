import { isActiveCoachAssignment } from './coachAssignments'
import { localCalendarDateKey } from './localCalendarDay'

/**
 * A workout is "missed" only when there was a real obligation — not rotation guidance.
 * For now: overdue coach assignments with an explicit due date.
 */
export const resolveMissedWorkoutObligations = (
  state = {},
  now = new Date(),
) => {
  const today = localCalendarDateKey(now)
  const assignments = state.coachAssignments ?? state.assignments ?? []

  return assignments
    .filter(
      (assignment) =>
        isActiveCoachAssignment(assignment) &&
        assignment?.due_date &&
        assignment.due_date < today,
    )
    .sort((first, second) =>
      String(second.due_date).localeCompare(String(first.due_date)),
    )
}
