import { buildStartsAtIso, resolveCoachScheduleTimezone } from './sessionTimezone'
import { SCHEDULED_SESSION_STATUS } from './coachScheduledSessions'

/**
 * A coach hub appointment is actionable only while scheduled and before
 * its scheduled end. Historical appointments remain in Calendar/history.
 */
export const isPendingCoachHubAppointment = (session, now = new Date()) => {
  if (!session || session.status !== SCHEDULED_SESSION_STATUS.SCHEDULED) return false

  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(currentTime)) return false

  let endTime = session.endsAt ?? session.ends_at ?? null
  if (endTime) endTime = new Date(endTime).getTime()

  if (!Number.isFinite(endTime)) {
    const startIso = session.startsAt ?? session.starts_at ??
      buildStartsAtIso(
        session.sessionDate ?? session.session_date,
        session.startTime ?? session.start_time,
        resolveCoachScheduleTimezone(session),
      )
    const startTime = startIso ? new Date(startIso).getTime() : Number.NaN
    const duration = Number(session.durationMinutes ?? session.duration_minutes ?? 60)
    endTime = Number.isFinite(startTime) && Number.isFinite(duration) && duration > 0
      ? startTime + duration * 60_000
      : Number.NaN
  }

  return Number.isFinite(endTime) && endTime > currentTime
}

export const filterPendingCoachHubAppointments = (sessions = [], now = new Date()) =>
  (sessions ?? []).filter((session) => isPendingCoachHubAppointment(session, now))
