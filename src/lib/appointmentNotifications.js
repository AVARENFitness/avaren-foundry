import { hasOpenScheduleConflictFollowUp } from './appointmentScheduleConflict'
import { formatAppointmentDayLabel } from './appointmentWhen'
import {
  DEFAULT_COACH_SCHEDULE_TIMEZONE,
  formatScheduledSessionTime,
  resolveCoachScheduleTimezone,
} from './sessionTimezone'
import {
  isRsvpException,
  normalizeRsvpStatus,
  RSVP_STATUS,
  shouldNotifyCoachForRsvpChange,
} from './sessionRsvp'
import { sessionStartTimestamp } from './sessionReminders'

export const APPOINTMENT_NOTIFICATION_TYPES = {
  SCHEDULED: 'appointment-scheduled',
  RESCHEDULED: 'appointment-rescheduled',
  CANCELLED: 'appointment-cancelled',
  ATHLETE_RSVP_CONFIRMED: 'appointment-athlete-confirmed',
  ATHLETE_RSVP_CANNOT_ATTEND: 'appointment-athlete-cannot-attend',
  ATHLETE_REMINDER_2H: 'appointment-athlete-reminder-2h',
  COACH_REMINDER_2H: 'appointment-coach-reminder-2h',
}

export const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000
export const REMINDER_WINDOW_BEFORE_MS = 5 * 60 * 1000
export const REMINDER_WINDOW_AFTER_MS = 5 * 60 * 1000

export const ACTIVE_APPOINTMENT_STATUSES = new Set(['scheduled'])

export const TERMINAL_APPOINTMENT_STATUSES = new Set([
  'cancelled',
  'completed',
  'missed',
])

export const resolveLinkedAthleteUserId = (appointment = {}) =>
  appointment.linkedUserId ??
  appointment.linked_user_id ??
  appointment.athleteId ??
  appointment.athlete_id ??
  null

export const isConnectedAthleteAppointment = (appointment = {}) =>
  Boolean(resolveLinkedAthleteUserId(appointment))

export const isOfflineClientAppointment = (appointment = {}) =>
  Boolean(appointment.businessClientId ?? appointment.business_client_id) &&
  !resolveLinkedAthleteUserId(appointment)

export const didMaterialScheduleChange = (before = {}, after = {}) =>
  String(before.startsAt ?? before.starts_at ?? '') !==
    String(after.startsAt ?? after.starts_at ?? '') ||
  String(before.scheduleTimezone ?? before.schedule_timezone ?? '') !==
    String(after.scheduleTimezone ?? after.schedule_timezone ?? '') ||
  String(before.sessionDate ?? before.session_date ?? '') !==
    String(after.sessionDate ?? after.session_date ?? '') ||
  String(before.startTime ?? before.start_time ?? '') !==
    String(after.startTime ?? after.start_time ?? '')

export const didTransitionToCancelled = (before = {}, after = {}) =>
  !TERMINAL_APPOINTMENT_STATUSES.has(String(before.status ?? '')) &&
  String(after.status ?? '') === 'cancelled'

export const buildCanonicalStartAt = (appointment = {}) =>
  appointment.startsAt ?? appointment.starts_at ?? null

export const LIFECYCLE_TRANSITION_NOTIFICATION_TYPES = new Set([
  APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED,
  APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
  APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
  APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CANNOT_ATTEND,
])

export const requiresTransitionIdentity = (notificationType) =>
  LIFECYCLE_TRANSITION_NOTIFICATION_TYPES.has(notificationType)

export const buildTransitionIdentity = (updatedAt) => {
  if (updatedAt == null || updatedAt === '') return 'unknown'
  return String(updatedAt)
}

export const buildAppointmentDedupeKey = ({
  recipientUserId,
  appointmentId,
  notificationType,
  canonicalStartAt = null,
  transitionIdentity = null,
  rsvpTransitionAt = null,
} = {}) => {
  const resolvedTransitionIdentity = transitionIdentity ?? rsvpTransitionAt
  const parts = [
    recipientUserId,
    appointmentId,
    notificationType,
    canonicalStartAt ?? 'none',
  ]

  if (requiresTransitionIdentity(notificationType)) {
    parts.push(resolvedTransitionIdentity ?? 'unknown')
  }

  return parts.filter(Boolean).join(':')
}

export const shouldCreateAthleteScheduledNotification = ({
  appointment = null,
  isInsert = false,
} = {}) => {
  if (!isInsert) return false
  if (!isConnectedAthleteAppointment(appointment)) return false
  if (String(appointment.status ?? '') !== 'scheduled') return false
  return true
}

export const shouldCreateAthleteRescheduledNotification = ({
  before = null,
  after = null,
} = {}) => {
  if (!before || !after) return false
  if (!isConnectedAthleteAppointment(after)) return false
  if (String(after.status ?? '') !== 'scheduled') return false
  return didMaterialScheduleChange(before, after)
}

export const shouldCreateAthleteCancelledNotification = ({
  before = null,
  after = null,
} = {}) => {
  if (!before || !after) return false
  if (!isConnectedAthleteAppointment(after)) return false
  return didTransitionToCancelled(before, after)
}

export const shouldEnqueueLifecycleNotification = ({
  before = null,
  after = null,
  notificationType,
  sentDedupeKeys = [],
} = {}) => {
  if (notificationType === APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED) {
    if (!shouldCreateAthleteRescheduledNotification({ before, after })) return false
  } else if (notificationType === APPOINTMENT_NOTIFICATION_TYPES.CANCELLED) {
    if (!shouldCreateAthleteCancelledNotification({ before, after })) return false
  } else if (notificationType === APPOINTMENT_NOTIFICATION_TYPES.SCHEDULED) {
    return false
  }

  const dedupeKey = buildAppointmentDedupeKey({
    recipientUserId: resolveLinkedAthleteUserId(after),
    appointmentId: after?.id,
    notificationType,
    canonicalStartAt: buildCanonicalStartAt(after),
    transitionIdentity: buildTransitionIdentity(
      after?.updatedAt ?? after?.updated_at,
    ),
  })

  return !sentDedupeKeys.includes(dedupeKey)
}

export const shouldCreateCoachRsvpNotification = ({
  previousStatus,
  nextStatus,
} = {}) => shouldNotifyCoachForRsvpChange(previousStatus, nextStatus)

export const resolveCoachRsvpNotificationType = (nextStatus) => {
  if (nextStatus === RSVP_STATUS.CONFIRMED) {
    return APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED
  }
  if (nextStatus === RSVP_STATUS.CANNOT_ATTEND) {
    return APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CANNOT_ATTEND
  }
  return null
}

export const hasUnresolvedCannotAttendConflict = (
  appointment = {},
  openFollowUps = [],
) => {
  if (!isRsvpException(appointment)) return false
  return hasOpenScheduleConflictFollowUp(
    openFollowUps,
    appointment.id ?? appointment.scheduledSessionId,
  )
}

export const shouldSuppressTwoHourReminder = (
  appointment = {},
  { openFollowUps = [] } = {},
) => {
  if (!isRsvpException(appointment)) return false
  return hasUnresolvedCannotAttendConflict(appointment, openFollowUps)
}

export const isWithinTwoHourReminderWindow = (
  appointment = {},
  now = new Date(),
) => {
  const startMs = sessionStartTimestamp({
    startsAt: buildCanonicalStartAt(appointment),
  })
  if (!Number.isFinite(startMs)) return false

  const nowMs = now.getTime()
  const windowStart = startMs - REMINDER_LEAD_MS - REMINDER_WINDOW_BEFORE_MS
  const windowEnd = startMs - REMINDER_LEAD_MS + REMINDER_WINDOW_AFTER_MS

  return nowMs >= windowStart && nowMs < windowEnd && nowMs < startMs
}

export const isTwoHourReminderEligible = (
  appointment = {},
  {
    now = new Date(),
    recipientRole = 'athlete',
    openFollowUps = [],
    reminderDeliveries = [],
    notificationType = null,
  } = {},
) => {
  const status = String(appointment.status ?? '')
  if (status !== 'scheduled') return false
  if (!buildCanonicalStartAt(appointment)) return false
  if (!isWithinTwoHourReminderWindow(appointment, now)) return false
  if (shouldSuppressTwoHourReminder(appointment, { openFollowUps })) return false

  if (recipientRole === 'athlete' && !isConnectedAthleteAppointment(appointment)) {
    return false
  }

  if (recipientRole === 'coach' && !(appointment.coachId ?? appointment.coach_id)) {
    return false
  }

  const resolvedType =
    notificationType ??
    (recipientRole === 'coach'
      ? APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H
      : APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H)

  const recipientUserId =
    recipientRole === 'coach'
      ? appointment.coachId ?? appointment.coach_id
      : resolveLinkedAthleteUserId(appointment)

  const dedupeKey = buildAppointmentDedupeKey({
    recipientUserId,
    appointmentId: appointment.id,
    notificationType: resolvedType,
    canonicalStartAt: buildCanonicalStartAt(appointment),
  })

  return !reminderDeliveries.some((entry) => {
    const matchesKey =
      entry.dedupeKey === dedupeKey || entry.dedupe_key === dedupeKey
    if (!matchesKey) return false

    const status = entry.deliveryStatus ?? entry.delivery_status
    return status === 'sent'
  })
}

export const buildAppointmentNotificationCopy = ({
  type,
  appointment = {},
  athleteDisplayName = 'Athlete',
  coachDisplayName = 'AVAREN',
} = {}) => {
  const timeZone = resolveCoachScheduleTimezone(appointment)
  const dayLabel = formatAppointmentDayLabel(appointment)
  const timeLabel =
    formatScheduledSessionTime(appointment) ||
    formatScheduledSessionTime({
      startsAt: buildCanonicalStartAt(appointment),
      scheduleTimezone: timeZone,
    }) ||
    'your session'

  switch (type) {
    case APPOINTMENT_NOTIFICATION_TYPES.SCHEDULED:
      return {
        title: 'Training scheduled',
        body: `${dayLabel} · ${timeLabel}`,
      }
    case APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED:
      return {
        title: 'Training rescheduled',
        body: `Now ${dayLabel} · ${timeLabel}`,
      }
    case APPOINTMENT_NOTIFICATION_TYPES.CANCELLED:
      return {
        title: 'Training cancelled',
        body: `${dayLabel} · ${timeLabel}`,
      }
    case APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H:
      return {
        title: 'Training in 2 hours',
        body: `Your session starts at ${timeLabel}.`,
      }
    case APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED:
      return {
        title: `${athleteDisplayName} confirmed`,
        body: `${dayLabel} · ${timeLabel}`,
      }
    case APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CANNOT_ATTEND:
      return {
        title: `${athleteDisplayName} can't make it`,
        body: `${dayLabel} · ${timeLabel}`,
      }
    case APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H: {
      const rsvpStatus = normalizeRsvpStatus(
        appointment.rsvpStatus ?? appointment.rsvp_status,
      )
      const rsvpHint =
        rsvpStatus === RSVP_STATUS.CONFIRMED
          ? 'Confirmed'
          : rsvpStatus === RSVP_STATUS.AWAITING
            ? 'Awaiting response'
            : null

      return {
        title: 'Training in 2 hours',
        body: rsvpHint
          ? `${athleteDisplayName} · ${timeLabel} · ${rsvpHint}`
          : `${athleteDisplayName} · ${timeLabel}`,
      }
    }
    default:
      return {
        title: 'Training update',
        body: `${dayLabel} · ${timeLabel}`,
      }
  }
}

export const buildAppointmentDeepLink = (appointmentId) =>
  `/?session=${encodeURIComponent(appointmentId)}&open=appointment-detail`

export const DEFAULT_APPOINTMENT_TIMEZONE = DEFAULT_COACH_SCHEDULE_TIMEZONE
