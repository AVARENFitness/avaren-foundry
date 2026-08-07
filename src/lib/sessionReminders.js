import {
  DEFAULT_COACH_SCHEDULE_TIMEZONE,
  buildStartsAtIso,
  formatSessionInstantTime,
  resolveCoachScheduleTimezone,
} from './sessionTimezone'

export { buildStartsAtIso, DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'

export const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000

export const sessionStartTimestamp = (session) => {
  if (!session?.startsAt) return null

  const parsed = new Date(session.startsAt)
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null
}

export const isReminderEligible = (session, now = new Date()) => {
  if (session?.status !== 'scheduled') return false
  if (session?.reminderSentAt) return false
  if (!session?.startsAt) return false

  const startMs = sessionStartTimestamp(session)
  if (!Number.isFinite(startMs)) return false

  const nowMs = now.getTime()
  return nowMs >= startMs - REMINDER_LEAD_MS && nowMs < startMs
}

export const shouldSkipReminder = (session) =>
  session?.status !== 'scheduled' ||
  Boolean(session?.reminderSentAt) ||
  !session?.startsAt

export const canClaimReminder = (session, now = new Date()) => {
  if (shouldSkipReminder(session)) return false

  if (session.reminderClaimedAt && session.reminderClaimExpiresAt) {
    const expires = new Date(session.reminderClaimExpiresAt).getTime()
    if (expires > now.getTime()) return false
  }

  return isReminderEligible(session, now)
}

export const shouldCompleteReminderDispatch = ({
  delivered = 0,
  subscriptionCount = 0,
} = {}) => delivered > 0 || subscriptionCount === 0

export const shouldReleaseReminderClaim = ({
  delivered = 0,
  subscriptionCount = 0,
} = {}) => subscriptionCount > 0 && delivered === 0

export const resetReminderStateOnReschedule = (session) => ({
  ...session,
  reminderSentAt: null,
  reminderClaimedAt: null,
  reminderClaimExpiresAt: null,
})

export const buildSessionReminderCopy = ({
  coachName = 'your coach',
  startsAt,
  timeZone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
}) => {
  const formattedTime = formatSessionInstantTime(startsAt, timeZone) || 'your session'

  return {
    title: `Training at ${formattedTime} with ${coachName}`,
    body: 'Are you still able to make it?',
  }
}

export const reminderClaimWouldDedupe = (sessions = [], sessionId) => {
  const matches = sessions.filter((session) => session.id === sessionId)
  return matches.length <= 1
}

export const buildScheduleInstant = ({
  sessionDate,
  startTime,
  scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
}) => ({
  startsAt: buildStartsAtIso(sessionDate, startTime, scheduleTimezone),
  scheduleTimezone: resolveCoachScheduleTimezone({ scheduleTimezone }),
})
