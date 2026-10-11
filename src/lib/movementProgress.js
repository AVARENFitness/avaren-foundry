import { isMobilityActivity } from './freeformCardio'

/**
 * Read-only movement totals from completed sessions.
 * Duration and distance come only from explicitly logged movement entries.
 * Miles and kilometers are kept separate; no estimates are fabricated.
 */
export const movementProgressSummary = (history = []) => {
  const result = {
    sessionsWithMovement: 0,
    cardioMinutes: 0,
    mobilityMinutes: 0,
    miles: 0,
    kilometers: 0,
    activities: 0,
  }

  for (const session of history ?? []) {
    const entries = Array.isArray(session?.cardioEntries)
      ? session.cardioEntries
      : []
    if (entries.length > 0) result.sessionsWithMovement += 1

    for (const entry of entries) {
      const minutes = Number(entry?.durationMinutes)
      if (!Number.isFinite(minutes) || minutes <= 0) continue
      result.activities += 1
      if (isMobilityActivity(entry?.kind)) {
        result.mobilityMinutes += minutes
      } else {
        result.cardioMinutes += minutes
      }

      const distance = Number(entry?.distance)
      if (entry?.distance == null || !Number.isFinite(distance) || distance <= 0) continue
      if (entry.distanceUnit === 'mi') result.miles += distance
      if (entry.distanceUnit === 'km') result.kilometers += distance
    }
  }

  return result
}
