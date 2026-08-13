import {
  hasLinkedAthlete,
  isActiveBusinessClient,
  isArchivedBusinessClient,
  isExplicitlyOfflineClient,
  resolveAthleteDataId,
} from './coachBusinessClient.js'

export const COACHING_REQUIREMENT_KEYS = {
  WEEKLY_CHECK_IN: 'weekly_check_in',
}

export const WEEKLY_CHECK_IN_REQUIREMENT = {
  REQUIRED: 'required',
  NOT_REQUIRED: 'not_required',
}

const DEFAULT_REQUIREMENTS = {
  [COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN]:
    WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED,
}

export const normalizeCoachingRequirements = (raw = null) => {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_REQUIREMENTS }
  }

  const weekly =
    raw[COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN] ??
    raw.weeklyCheckIn ??
    (raw.weekly_check_in_required === false
      ? WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED
      : raw.weekly_check_in_required === true
        ? WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED
        : DEFAULT_REQUIREMENTS[COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN])

  return {
    [COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN]:
      weekly === WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED
        ? WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED
        : WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED,
  }
}

export const readCoachingRequirementsFromClient = (client = {}) =>
  normalizeCoachingRequirements(
    client.coaching_requirements ??
      client.coachingRequirements ??
      (client.weekly_check_in_required === false
        ? {
            [COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN]:
              WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED,
          }
        : null),
  )

export const isWeeklyCheckInRequiredForClient = (client = {}) => {
  if (!isActiveBusinessClient(client)) return false
  if (isArchivedBusinessClient(client)) return false
  if (isExplicitlyOfflineClient(client)) return false

  const athleteDataId = resolveAthleteDataId(client)
  if (!athleteDataId) return false

  const requirements = readCoachingRequirementsFromClient(client)
  return (
    requirements[COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN] ===
    WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED
  )
}

export const canConfigureWeeklyCheckInRequirement = (client = {}) =>
  isActiveBusinessClient(client) &&
  !isArchivedBusinessClient(client) &&
  hasLinkedAthlete(client)

export const hasActiveCoachBridge = (client = {}) => {
  if (isExplicitlyOfflineClient(client)) return false
  if (!resolveAthleteDataId(client)) return false
  if (client.hasCoachBridge === false) return false
  return true
}

export const createsActiveWeeklyCheckInObligation = (client = {}) =>
  isActiveBusinessClient(client) &&
  !isArchivedBusinessClient(client) &&
  hasActiveCoachBridge(client) &&
  isWeeklyCheckInRequiredForClient(client)

export const buildCoachingRequirementsUpdate = ({
  weeklyCheckInRequired = true,
} = {}) => ({
  [COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN]: weeklyCheckInRequired
    ? WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED
    : WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED,
})

export const mergeWeeklyCheckInRequirement = (
  existing = {},
  weeklyCheckIn = WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED,
) => {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...existing }
      : {}

  return {
    ...base,
    [COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN]:
      weeklyCheckIn === WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED
        ? WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED
        : WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED,
  }
}

export const normalizeUpdateCoachingRequirementsRpcResult = (payload = null) => {
  if (!payload || typeof payload !== 'object') return null

  if (payload.ok === true && payload.business_client_id) {
    return {
      ok: true,
      businessClientId: String(payload.business_client_id),
      weeklyCheckIn:
        payload.weekly_check_in === WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED
          ? WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED
          : WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED,
    }
  }

  return null
}

export const isDuplicateActiveLinkedRelationshipsError = (error = null) =>
  /duplicate_active_linked_relationships/i.test(error?.message ?? '')

export const isInvalidWeeklyCheckInRequirementError = (error = null) =>
  /invalid_weekly_check_in_requirement/i.test(error?.message ?? '')
