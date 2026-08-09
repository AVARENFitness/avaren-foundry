export const SESSION_MODE = {
  SOLO: 'solo',
  COACH_ASSIGNED: 'coach_assigned',
  IN_PERSON_COACHED: 'in_person_coached',
}

export const SESSION_MODE_LABEL = {
  [SESSION_MODE.SOLO]: null,
  [SESSION_MODE.COACH_ASSIGNED]: 'Assigned by Coach',
  [SESSION_MODE.IN_PERSON_COACHED]: 'In-Person Session',
}

export const resolveSessionMode = ({
  assignmentId = null,
  coachAssigned = false,
  inPersonToday = false,
  explicitMode = null,
} = {}) => {
  if (explicitMode && Object.values(SESSION_MODE).includes(explicitMode)) {
    return explicitMode
  }

  if (assignmentId && inPersonToday) {
    return SESSION_MODE.IN_PERSON_COACHED
  }

  if (assignmentId || coachAssigned) {
    return SESSION_MODE.COACH_ASSIGNED
  }

  return SESSION_MODE.SOLO
}

export const sessionModeLabel = (mode = null) =>
  SESSION_MODE_LABEL[mode] ?? null

export const isCoachedSessionMode = (mode = null) =>
  mode === SESSION_MODE.COACH_ASSIGNED ||
  mode === SESSION_MODE.IN_PERSON_COACHED

export const attachSessionModeMetadata = (session = {}, mode = SESSION_MODE.SOLO) => ({
  ...session,
  sessionMode: mode,
})

export const hasScheduledInPersonToday = (sessions = [], todayKey = null) => {
  const key =
    todayKey ?? new Date().toISOString().slice(0, 10)

  return (sessions ?? []).some((item) => {
    const date = String(
      item?.scheduled_date ?? item?.scheduledDate ?? item?.date ?? '',
    ).slice(0, 10)
    return date === key && item?.status !== 'cancelled'
  })
}
