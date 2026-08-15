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
import { getWeeklyCheckInStatus, isSubmittedWeeklyCheckIn } from './weeklyCheckIn.js'

export const isAthleteWeeklyCheckInRequired = (requirements = null) => {
  const normalized = normalizeCoachingRequirements(requirements)

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

export const isWeeklyCheckInRequired = (coachingRequirements = null) =>
  isAthleteWeeklyCheckInRequired(coachingRequirements)

export const ROSTER_ATHLETE_CHECK_IN_STATUS = {
  SUBMITTED: 'submitted',
  MISSING: 'missing',
  NOT_REQUIRED: 'not_required',
  NOT_APPLICABLE: 'n/a',
}

export const resolveAthleteCheckInRosterStatus = ({
  client = null,
  weeklyCheckIn = null,
  now = new Date(),
} = {}) => {
  if (!isWeeklyCheckInEligible(client)) {
    return ROSTER_ATHLETE_CHECK_IN_STATUS.NOT_APPLICABLE
  }

  if (!isWeeklyCheckInObligationActive(client)) {
    return ROSTER_ATHLETE_CHECK_IN_STATUS.NOT_REQUIRED
  }

  return isSubmittedWeeklyCheckIn(weeklyCheckIn, now)
    ? ROSTER_ATHLETE_CHECK_IN_STATUS.SUBMITTED
    : ROSTER_ATHLETE_CHECK_IN_STATUS.MISSING
}

export const canLoadAthleteIntelligence = (client = {}) =>
  Boolean(resolveAthleteDataId(client))
