export const buildAppointmentCoachIdentityDiagnostics = (appointment = {}) => ({
  appointmentIdPresent: Boolean(appointment?.id),
  coachIdPresent: Boolean(String(appointment?.coachId ?? '').trim()),
  coach_idPresent: Boolean(String(appointment?.coach_id ?? '').trim()),
  coachDisplayNamePresent: Boolean(
    String(appointment?.coachDisplayName ?? appointment?.coach_display_name ?? '').trim(),
  ),
  athleteIdPresent: Boolean(
    String(appointment?.athleteId ?? appointment?.athlete_id ?? '').trim(),
  ),
})

export const resolveAppointmentCoachId = (appointment = {}) =>
  String(appointment?.coachId ?? appointment?.coach_id ?? '').trim() || null

export function resolveAppointmentLinkedFollowUpCoachId({
  coachId = null,
  scheduledSessionId = null,
} = {}) {
  const normalizedCoachId = String(coachId ?? '').trim()
  if (normalizedCoachId) return normalizedCoachId

  if (scheduledSessionId) {
    throw new Error('followup_missing_session_coach')
  }

  throw new Error('followup_missing_session_coach')
}

export async function resolveFollowUpCoachId({
  coachId = null,
  assignmentId = null,
  scheduledSessionId = null,
  fetchCoachIdFromAssignment = null,
  fetchDefaultCoachId = null,
} = {}) {
  if (scheduledSessionId) {
    return resolveAppointmentLinkedFollowUpCoachId({
      coachId,
      scheduledSessionId,
    })
  }

  const normalizedCoachId = String(coachId ?? '').trim()
  if (normalizedCoachId) return normalizedCoachId

  if (assignmentId && typeof fetchCoachIdFromAssignment === 'function') {
    const fromAssignment = await fetchCoachIdFromAssignment(assignmentId)
    if (fromAssignment) return fromAssignment
  }

  if (typeof fetchDefaultCoachId === 'function') {
    return fetchDefaultCoachId()
  }

  return null
}

export const buildFollowUpInsertDiagnostics = ({
  athleteId = null,
  coachId = null,
  scheduledSessionId = null,
  assignmentId = null,
  reasonType = null,
  sourceType = null,
} = {}) => ({
  athleteMatchesAuth: Boolean(athleteId),
  coachIdPresent: Boolean(coachId),
  scheduledSessionIdPresent: Boolean(scheduledSessionId),
  assignmentLinked: Boolean(assignmentId),
  reasonType: reasonType ?? null,
  sourceType: sourceType ?? null,
})

/** DEV-safe identity comparison for schedule-conflict insert forensics. */
export const buildScheduleConflictFollowUpForensics = ({
  appointment = {},
  authAthleteId = null,
  followUpPayload = {},
} = {}) => {
  const displayedAppointmentId = String(appointment?.id ?? '').trim()
  const appointmentCoachId = resolveAppointmentCoachId(appointment)
  const scheduledSessionId = String(
    followUpPayload.scheduled_session_id ??
      followUpPayload.scheduledSessionId ??
      displayedAppointmentId,
  ).trim()
  const followUpCoachId = String(
    followUpPayload.coach_id ?? followUpPayload.coachId ?? appointmentCoachId ?? '',
  ).trim()
  const followUpAthleteId = String(
    followUpPayload.athlete_id ?? followUpPayload.athleteId ?? authAthleteId ?? '',
  ).trim()

  return {
    sessionExists: null,
    sessionIdMatchesDisplayedAppointment:
      Boolean(displayedAppointmentId) &&
      scheduledSessionId === displayedAppointmentId,
    coachMatches:
      Boolean(appointmentCoachId) &&
      Boolean(followUpCoachId) &&
      appointmentCoachId === followUpCoachId,
    athleteMatches:
      Boolean(followUpAthleteId) &&
      Boolean(authAthleteId) &&
      followUpAthleteId === authAthleteId,
    authMatchesAthlete:
      Boolean(authAthleteId) &&
      Boolean(followUpAthleteId) &&
      authAthleteId === followUpAthleteId,
    coachClientRelationshipExists: null,
  }
}

export const inferFollowUpScheduledSessionFailure = ({
  errorMessage = '',
  forensics = {},
} = {}) => {
  if (!String(errorMessage).includes('followup_insert_invalid_scheduled_session')) {
    return null
  }

  const {
    sessionIdMatchesDisplayedAppointment,
    coachMatches,
    athleteMatches,
    authMatchesAthlete,
  } = forensics

  if (
    sessionIdMatchesDisplayedAppointment &&
    coachMatches &&
    athleteMatches &&
    authMatchesAthlete
  ) {
    return 'trigger_session_lookup_blocked_by_rls'
  }

  if (!sessionIdMatchesDisplayedAppointment) {
    return 'wrong_scheduled_session_id'
  }

  if (!coachMatches) {
    return 'coach_id_mismatch'
  }

  if (!athleteMatches || !authMatchesAthlete) {
    return 'athlete_id_mismatch'
  }

  return 'scheduled_session_validation_failed'
}
