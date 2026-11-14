const toMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''))
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

const blockingStatuses = new Set(['scheduled'])

const isBlocking = (item) =>
  blockingStatuses.has(String(item?.status ?? 'scheduled').toLowerCase())

/**
 * Find a time collision across personal events, athlete appointments, and
 * coach business sessions displayed on one merged calendar.
 *
 * This must not use the coach-ownership guard in appointmentsOverlap: unlike
 * client appointment creation, a personal event has no coachId.
 */
export const findOverlappingCalendarItem = (
  candidate,
  items = [],
  { excludeId = null } = {},
) => {
  if (!candidate || !isBlocking(candidate)) return null
  const day = String(candidate.sessionDate ?? candidate.eventDate ?? '')
  const start = toMinutes(candidate.startTime ?? candidate.start_time)
  const duration = Number(candidate.durationMinutes ?? candidate.duration_minutes ?? 60)
  if (!day || start == null || !Number.isFinite(duration) || duration <= 0) return null
  const end = start + duration

  return (items ?? []).find((item) => {
    if (!item || !isBlocking(item)) return false
    if (excludeId != null && String(item.id) === String(excludeId)) return false
    if (String(item.sessionDate ?? item.eventDate ?? '') !== day) return false
    const otherStart = toMinutes(item.startTime ?? item.start_time)
    const otherDuration = Number(item.durationMinutes ?? item.duration_minutes ?? 60)
    if (otherStart == null || !Number.isFinite(otherDuration) || otherDuration <= 0) return false
    return start < otherStart + otherDuration && otherStart < end
  }) ?? null
}
