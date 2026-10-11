import { isMobilityActivity } from './freeformCardio'
import { sessionLocalCalendarDateKey, localCalendarDateKey } from './localCalendarDay'

/** Last six complete-or-current local calendar weeks, Monday through Sunday. */
export const weeklyMovementTrends = (history = [], now = new Date()) => {
  const today = new Date(now)
  if (!Number.isFinite(today.getTime())) return []
  today.setHours(12, 0, 0, 0)
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weeks = Array.from({ length: 6 }, (_, index) => {
    const start = new Date(monday)
    start.setDate(monday.getDate() - (5 - index) * 7)
    return {
      key: localCalendarDateKey(start),
      label: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      cardioMinutes: 0,
      mobilityMinutes: 0,
      sessions: 0,
    }
  })

  const start = weeks[0].key
  const end = localCalendarDateKey(today)
  for (const session of history ?? []) {
    const day = sessionLocalCalendarDateKey(session)
    if (!day || day < start || day > end) continue
    const week = weeks.findLast((item) => item.key <= day)
    if (!week) continue
    const entries = Array.isArray(session.cardioEntries) ? session.cardioEntries : []
    let hasValidMovement = false
    for (const entry of entries) {
      const minutes = Number(entry?.durationMinutes)
      if (!Number.isFinite(minutes) || minutes <= 0) continue
      hasValidMovement = true
      if (isMobilityActivity(entry.kind)) week.mobilityMinutes += minutes
      else week.cardioMinutes += minutes
    }
    if (hasValidMovement) week.sessions += 1
  }
  return weeks
}
