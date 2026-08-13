import {
  isActiveBusinessClient,
  isArchivedBusinessClient,
  isExplicitlyOfflineClient,
  resolveAthleteDataId,
  resolveCanonicalLinkedUserId,
} from './coachBusinessClient.js'
import {
  createsActiveWeeklyCheckInObligation,
  COACHING_REQUIREMENT_KEYS,
  normalizeCoachingRequirements,
  WEEKLY_CHECK_IN_REQUIREMENT,
} from './coachClientRequirements.js'
import { getWeeklyCheckInStatus } from './weeklyCheckIn.js'

export const isAthleteWeeklyCheckInRequired = (requirements = null) => {
  const normalized = normalizeCoachingRequirements(
    requirements ?? {
      [COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN]:
        WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED,
    },
  )

  return (
    normalized[COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN] ===
    WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED
  )
}

export const resolveAthleteWeeklyCheckInSession = ({
  requirements = null,
  submission = null,
  now = new Date(),
} = {}) => {
  const required = isAthleteWeeklyCheckInRequired(requirements)
  const status = getWeeklyCheckInStatus({
    obligationActive: required,
    submission,
    now,
  })

  return { required, status }
}

export const isWeeklyCheckInEligible = (client = {}) => {
  if (!isActiveBusinessClient(client)) return false
  if (isArchivedBusinessClient(client)) return false
  if (isExplicitlyOfflineClient(client)) return false

  const athleteId = resolveAthleteDataId(client)
  if (!athleteId) return false

  if (
    client.hasCoachBridge === false &&
    !resolveCanonicalLinkedUserId(client)
  ) {
    return false
  }

  return true
}

export const isWeeklyCheckInObligationActive = (client = {}) =>
  isWeeklyCheckInEligible(client) &&
  createsActiveWeeklyCheckInObligation(client)

export const canLoadAthleteIntelligence = (client = {}) =>
  Boolean(resolveAthleteDataId(client))
