export const APPOINTMENT_LINKAGE_ERROR = 'appointment_missing_business_client_linkage'

export const appointmentLinkageUserMessage = (code = APPOINTMENT_LINKAGE_ERROR) => {
  const messages = {
    [APPOINTMENT_LINKAGE_ERROR]:
      'This client is missing business linkage. Refresh and try again.',
    appointment_coach_client_mismatch:
      'This client does not belong to your roster.',
    appointment_athlete_link_mismatch:
      'This client link is out of date. Refresh and try again.',
  }
  return messages[code] ?? messages[APPOINTMENT_LINKAGE_ERROR]
}

export const resolveConnectedBusinessClientId = ({
  coachId,
  athleteId,
  coachClientBridge = null,
  businessClients = [],
} = {}) => {
  if (!coachId || !athleteId) {
    return {
      businessClientId: null,
      businessClientResolved: false,
      resolvedBusinessClientMatchesCoach: false,
      resolvedBusinessClientMatchesAthlete: false,
      ambiguous: false,
    }
  }

  const bridgeId =
    coachClientBridge?.business_client_id ??
    coachClientBridge?.businessClientId ??
    null

  const matches = (businessClients ?? []).filter(
    (client) =>
      client.coach_id === coachId &&
      client.linked_user_id === athleteId,
  )

  if (matches.length > 1) {
    return {
      businessClientId: null,
      businessClientResolved: false,
      resolvedBusinessClientMatchesCoach: false,
      resolvedBusinessClientMatchesAthlete: false,
      ambiguous: true,
    }
  }

  const directMatch = matches[0] ?? null
  const resolvedId = bridgeId ?? directMatch?.id ?? null
  const resolvedClient =
    directMatch ??
    (resolvedId
      ? (businessClients ?? []).find((client) => client.id === resolvedId)
      : null)

  return {
    businessClientId: resolvedId,
    businessClientResolved: Boolean(resolvedId),
    resolvedBusinessClientMatchesCoach: resolvedClient
      ? resolvedClient.coach_id === coachId
      : Boolean(resolvedId),
    resolvedBusinessClientMatchesAthlete: resolvedClient
      ? resolvedClient.linked_user_id === athleteId
      : Boolean(resolvedId),
    ambiguous: false,
  }
}

export const validateConnectedAppointmentLinkage = ({
  coachId,
  athleteId,
  businessClientId,
  businessClients = [],
} = {}) => {
  if (!athleteId) {
    return { ok: true }
  }

  if (!businessClientId) {
    return { ok: false, error: APPOINTMENT_LINKAGE_ERROR }
  }

  const client = (businessClients ?? []).find(
    (entry) => entry.id === businessClientId,
  )

  if (client) {
    if (client.coach_id !== coachId) {
      return { ok: false, error: 'appointment_coach_client_mismatch' }
    }
    if (client.linked_user_id !== athleteId) {
      return { ok: false, error: 'appointment_athlete_link_mismatch' }
    }
    return { ok: true }
  }

  return { ok: true }
}

export const auditAppointmentLinkageRepair = ({
  appointments = [],
  businessClients = [],
} = {}) => {
  const repairable = []
  const ambiguous = []
  const unresolvable = []

  for (const appointment of appointments) {
    if (appointment.business_client_id ?? appointment.businessClientId) continue
    const athleteId = appointment.athlete_id ?? appointment.athleteId
    const coachId = appointment.coach_id ?? appointment.coachId
    if (!athleteId || !coachId) {
      unresolvable.push(appointment)
      continue
    }

    const resolution = resolveConnectedBusinessClientId({
      coachId,
      athleteId,
      businessClients,
    })

    if (resolution.ambiguous) {
      ambiguous.push(appointment)
      continue
    }

    if (resolution.businessClientResolved) {
      repairable.push({
        ...appointment,
        resolvedBusinessClientId: resolution.businessClientId,
      })
      continue
    }

    unresolvable.push(appointment)
  }

  return { repairable, ambiguous, unresolvable }
}

export const buildSessionLinkageForensics = (session = null) => ({
  sessionExists: Boolean(session?.id),
  athleteIdPresent: Boolean(session?.athleteId ?? session?.athlete_id),
  businessClientIdPresent: Boolean(
    session?.businessClientId ?? session?.business_client_id,
  ),
  coachIdPresent: Boolean(session?.coachId ?? session?.coach_id),
  statusCompleted:
    session?.status === 'completed' || session?.status === 'COMPLETED',
})
