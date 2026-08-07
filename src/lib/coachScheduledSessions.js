import {
  canRecordSession,
  recordSessionOnPackage,
  undoSessionRecord,
} from './sessionPackages'

export const SCHEDULED_SESSION_STATUS = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

export { DEFAULT_RSVP_STATUS, RSVP_STATUS, normalizeRsvpStatus } from './sessionRsvp'

import {
  DEFAULT_RSVP_STATUS,
  normalizeRsvpStatus,
} from './sessionRsvp'

export const normalizeScheduledSession = (row) => {
  if (!row) return null

  return {
    id: row.id,
    coachId: row.coach_id,
    athleteId: row.athlete_id,
    sessionDate: row.session_date,
    startTime: String(row.start_time ?? '').slice(0, 5),
    durationMinutes: row.duration_minutes ?? null,
    coachNote: row.coach_note ?? '',
    status: row.status ?? SCHEDULED_SESSION_STATUS.SCHEDULED,
    rsvpStatus: normalizeRsvpStatus(row.rsvp_status ?? DEFAULT_RSVP_STATUS),
    rsvpUpdatedAt: row.rsvp_updated_at ?? null,
    reminderSentAt: row.reminder_sent_at ?? null,
    reminderClaimedAt: row.reminder_claimed_at ?? null,
    reminderClaimExpiresAt: row.reminder_claim_expires_at ?? null,
    coachDisplayName: row.coach_display_name ?? null,
    startsAt: row.starts_at ?? null,
    scheduleTimezone: row.schedule_timezone ?? null,
    completedAt: row.completed_at ?? null,
    sessionHistoryId: row.session_history_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const formatSessionTime = (startTime = '') => {
  const [hours, minutes] = String(startTime).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return startTime

  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const sessionDateTime = (session) => {
  if (session?.startsAt) {
    const parsed = new Date(session.startsAt)
    if (Number.isFinite(parsed.getTime())) return parsed.getTime()
  }

  const value = `${session.sessionDate}T${session.startTime || '12:00'}:00`
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

export const sortScheduledSessions = (sessions = []) =>
  [...sessions].sort(
    (first, second) =>
      sessionDateTime(first) - sessionDateTime(second) ||
      String(first.startTime).localeCompare(String(second.startTime)),
  )

export const canCompleteScheduledSession = (session, pkg) =>
  Boolean(
    session?.status === SCHEDULED_SESSION_STATUS.SCHEDULED &&
      canRecordSession(pkg),
  )

export const completeScheduledSession = ({
  session,
  pkg,
  coachLabel,
  now = new Date(),
}) => {
  if (session?.status === SCHEDULED_SESSION_STATUS.COMPLETED) {
    return { ok: false, error: 'already_completed' }
  }

  if (session?.status === SCHEDULED_SESSION_STATUS.CANCELLED) {
    return { ok: false, error: 'session_cancelled' }
  }

  const recorded = recordSessionOnPackage(pkg, {
    coachLabel,
    note: session.coachNote ?? '',
    sessionDate: session.sessionDate,
    now,
  })

  if (!recorded.ok) {
    return recorded
  }

  return {
    ok: true,
    package: recorded.package,
    historyEntry: recorded.historyEntry,
    undoSnapshot: recorded.undoSnapshot,
    session: {
      ...session,
      status: SCHEDULED_SESSION_STATUS.COMPLETED,
      completedAt: now.toISOString(),
      sessionHistoryId: recorded.historyEntry.id,
    },
  }
}

export const undoScheduledSessionCompletion = ({
  session,
  pkg,
  history = [],
  undoSnapshot,
}) => {
  if (session?.status !== SCHEDULED_SESSION_STATUS.COMPLETED) {
    return { ok: false, error: 'not_completed' }
  }

  const undone = undoSessionRecord(pkg, history, undoSnapshot)
  if (!undone.ok) {
    return undone
  }

  return {
    ok: true,
    package: undone.package,
    history: undone.history,
    session: {
      ...session,
      status: SCHEDULED_SESSION_STATUS.SCHEDULED,
      completedAt: null,
      sessionHistoryId: null,
    },
  }
}

export const cancelScheduledSession = (session) => {
  if (session?.status === SCHEDULED_SESSION_STATUS.COMPLETED) {
    return { ok: false, error: 'already_completed' }
  }

  return {
    ok: true,
    session: {
      ...session,
      status: SCHEDULED_SESSION_STATUS.CANCELLED,
    },
  }
}

const COMPLETION_ERROR_CODES = [
  'already_completed',
  'no_sessions_remaining',
  'session_cancelled',
  'no_package',
  'package_expired',
  'session_not_found',
  'not_authorized',
  'not_authenticated',
  'not_completed',
  'missing_history',
  'history_not_found',
  'invalid_package_state',
]

export const mapCompleteScheduledSessionRpcError = (error) => {
  const message = String(error?.message ?? error ?? '')
  const code =
    COMPLETION_ERROR_CODES.find((entry) => message.includes(entry)) ??
    'completion_failed'

  return {
    ok: false,
    error: code,
    message,
  }
}

export const normalizeCompleteScheduledSessionRpcResult = (payload) => {
  if (!payload?.session || !payload?.package) {
    return { ok: false, error: 'empty_response' }
  }

  return {
    ok: true,
    session: payload.session,
    package: payload.package,
    history: payload.history ?? null,
  }
}

export const normalizeUndoScheduledSessionRpcResult = (payload) => {
  if (!payload?.session || !payload?.package) {
    return { ok: false, error: 'empty_response' }
  }

  return {
    ok: true,
    session: payload.session,
    package: payload.package,
  }
}

export const normalizeAthleteScheduledSession = (row) => {
  if (!row) return null

  return {
    id: row.id,
    coachDisplayName: row.coach_display_name ?? row.coachDisplayName ?? 'Coach',
    sessionDate: row.session_date ?? row.sessionDate ?? null,
    startTime: String(row.start_time ?? row.startTime ?? '').slice(0, 5),
    startsAt: row.starts_at ?? row.startsAt ?? null,
    scheduleTimezone: row.schedule_timezone ?? row.scheduleTimezone ?? null,
    durationMinutes: row.duration_minutes ?? row.durationMinutes ?? null,
    status: row.status ?? SCHEDULED_SESSION_STATUS.SCHEDULED,
    rsvpStatus: normalizeRsvpStatus(row.rsvp_status ?? row.rsvpStatus),
    rsvpUpdatedAt: row.rsvp_updated_at ?? row.rsvpUpdatedAt ?? null,
  }
}
