export const RSVP_STATUS = {
  AWAITING: 'awaiting_response',
  CONFIRMED: 'confirmed',
  CANNOT_ATTEND: 'cannot_attend',
}

export const DEFAULT_RSVP_STATUS = RSVP_STATUS.AWAITING

export const normalizeRsvpStatus = (value) => {
  if (value === RSVP_STATUS.CONFIRMED) return RSVP_STATUS.CONFIRMED
  if (value === RSVP_STATUS.CANNOT_ATTEND) return RSVP_STATUS.CANNOT_ATTEND
  return RSVP_STATUS.AWAITING
}

export const rsvpCoachLabel = (status = DEFAULT_RSVP_STATUS) => {
  if (status === RSVP_STATUS.CONFIRMED) return 'Confirmed'
  if (status === RSVP_STATUS.CANNOT_ATTEND) return "Can't make it"
  return 'Awaiting reply'
}

export const rsvpAthleteLabel = (status = DEFAULT_RSVP_STATUS) => {
  if (status === RSVP_STATUS.CONFIRMED) return 'Confirmed'
  if (status === RSVP_STATUS.CANNOT_ATTEND) return "Can't make it"
  return 'Awaiting your reply'
}

export const canAthleteUpdateRsvp = (session) =>
  Boolean(session?.status === 'scheduled')

export const isRsvpException = (session) =>
  session?.rsvpStatus === RSVP_STATUS.CANNOT_ATTEND &&
  session?.status === 'scheduled'

export const sortSessionsForCoachToday = (sessions = []) =>
  [...sessions].sort((first, second) => {
    const firstException = isRsvpException(first) ? 0 : 1
    const secondException = isRsvpException(second) ? 0 : 1
    if (firstException !== secondException) {
      return firstException - secondException
    }

    return (
      String(first.sessionDate).localeCompare(String(second.sessionDate)) ||
      String(first.startTime).localeCompare(String(second.startTime))
    )
  })

import { formatScheduledSessionTime } from './sessionTimezone'

export const buildCoachRsvpAlert = (session, athleteName = 'Athlete') => {
  if (!isRsvpException(session)) return null

  return `${athleteName} can't make ${formatScheduledSessionTime(session)}`
}

export const mapRsvpRpcError = (error) => {
  const message = String(error?.message ?? error ?? '')
  const codes = [
    'not_authenticated',
    'invalid_rsvp_status',
    'session_not_found',
    'session_not_open',
  ]
  const code = codes.find((entry) => message.includes(entry)) ?? 'rsvp_failed'
  return { ok: false, error: code, message }
}

export const normalizeRsvpRpcResult = (payload) => {
  if (!payload?.session) return { ok: false, error: 'empty_response' }
  return {
    ok: true,
    unchanged: Boolean(payload.unchanged),
    session: payload.session,
  }
}

export const shouldNotifyCoachForRsvpChange = (previousStatus, nextStatus) =>
  previousStatus !== nextStatus &&
  (nextStatus === RSVP_STATUS.CONFIRMED ||
    nextStatus === RSVP_STATUS.CANNOT_ATTEND)

export const ATHLETE_SESSION_PRIVATE_FIELDS = [
  'coach_note',
  'coachNote',
  'session_history_id',
  'sessionHistoryId',
  'reminder_sent_at',
  'reminderSentAt',
  'reminder_claimed_at',
  'reminderClaimedAt',
  'reminder_claim_expires_at',
  'reminderClaimExpiresAt',
  'coach_id',
  'coachId',
  'athlete_id',
  'athleteId',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
]

export const isAthleteSessionPayloadSafe = (row = {}) =>
  ATHLETE_SESSION_PRIVATE_FIELDS.every(
    (field) => !Object.prototype.hasOwnProperty.call(row, field),
  )

export const athleteCanAccessSession = (session, athleteId) =>
  Boolean(session?.athleteId && session.athleteId === athleteId)

export const athleteProtectedSessionFields = [
  'coachId',
  'coach_id',
  'sessionDate',
  'session_date',
  'startTime',
  'start_time',
  'durationMinutes',
  'duration_minutes',
  'status',
  'sessionHistoryId',
  'session_history_id',
]

export const isProtectedSessionFieldMutation = (patch = {}) =>
  athleteProtectedSessionFields.some((field) =>
    Object.prototype.hasOwnProperty.call(patch, field),
  )
