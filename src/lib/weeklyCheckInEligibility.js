import {
  isActiveBusinessClient,
  isArchivedBusinessClient,
  isExplicitlyOfflineClient,
  resolveAthleteDataId,
  resolveCanonicalLinkedUserId,
} from './coachBusinessClient.js'

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

export const canLoadAthleteIntelligence = (client = {}) =>
  Boolean(resolveAthleteDataId(client))
