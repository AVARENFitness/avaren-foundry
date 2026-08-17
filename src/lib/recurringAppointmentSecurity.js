export const RECURRENCE_SERIES_TABLE_PRIVILEGES = {
  authenticated: ['select'],
  service_role: ['all'],
}

export const assertRecurrenceAssignmentOwnership = ({
  assignmentCoachId = '',
  callerCoachId = '',
  linkedAthleteUserId = null,
  assignmentAthleteId = null,
} = {}) => {
  if (!linkedAthleteUserId) {
    throw new Error('appointment_invalid_assignment')
  }

  if (
    !assignmentCoachId ||
    !callerCoachId ||
    assignmentCoachId !== callerCoachId ||
    assignmentAthleteId !== linkedAthleteUserId
  ) {
    throw new Error('appointment_invalid_assignment')
  }
}
