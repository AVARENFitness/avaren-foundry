import {
  APPOINTMENT_NOTIFICATION_TYPES,
  buildAppointmentDeepLink,
  buildAppointmentNotificationCopy,
} from './appointmentNotifications'
import { APPOINTMENT_SERIES_NOTIFICATION_TYPES } from './appointmentSeriesNotifications'
import { DELIVERY_STATUS } from './appointmentNotificationDeliveries'

export const IMMEDIATE_APPOINTMENT_NOTIFICATION_TYPES = new Set([
  APPOINTMENT_NOTIFICATION_TYPES.SCHEDULED,
  APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED,
  APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
  APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
  APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CANNOT_ATTEND,
  APPOINTMENT_SERIES_NOTIFICATION_TYPES.CREATED,
  APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED,
  APPOINTMENT_SERIES_NOTIFICATION_TYPES.CANCELLED,
])

export const REMINDER_APPOINTMENT_NOTIFICATION_TYPES = new Set([
  APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
  APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H,
])

export const isImmediateAppointmentNotificationType = (notificationType) =>
  IMMEDIATE_APPOINTMENT_NOTIFICATION_TYPES.has(notificationType)

export const isReminderAppointmentNotificationType = (notificationType) =>
  REMINDER_APPOINTMENT_NOTIFICATION_TYPES.has(notificationType)

export const isInvalidPushSubscriptionStatus = (statusCode) =>
  statusCode === 404 || statusCode === 410

export const buildAppointmentPushUrl = ({
  action,
  payload = {},
  scheduledSessionId = null,
} = {}) => {
  const sessionId =
    scheduledSessionId ??
    payload.scheduledSessionId ??
    payload.scheduled_session_id ??
    null

  if (action === 'open-coach-calendar' && sessionId) {
    return `/?open=coach-calendar&session=${encodeURIComponent(sessionId)}`
  }

  if (action === 'open-athlete-schedule') {
    return '/?open=athlete-schedule'
  }

  if (
    payload.openTarget === 'athlete-schedule' ||
    payload.open_target === 'athlete-schedule'
  ) {
    return '/?open=athlete-schedule'
  }

  if (sessionId) {
    return buildAppointmentDeepLink(sessionId)
  }

  return '/?open=notifications'
}

export const buildAppointmentPushPayload = ({
  title,
  body,
  action,
  payload = {},
  notificationType,
  scheduledSessionId = null,
  dedupeKey = null,
} = {}) => {
  const sessionId =
    scheduledSessionId ??
    payload.scheduledSessionId ??
    payload.scheduled_session_id ??
    null

  const url = buildAppointmentPushUrl({ action, payload, scheduledSessionId: sessionId })
  const tag =
    dedupeKey ??
    (notificationType && sessionId
      ? `${notificationType}:${sessionId}`
      : sessionId ?? 'avaren-appointment')

  return {
    title: title ?? 'AVAREN',
    body: body ?? 'You have a training update.',
    sessionId,
    url,
    tag,
    notificationType: notificationType ?? null,
  }
}

export const buildReminderPushPayload = ({
  target = {},
  athleteLabel = 'Athlete',
} = {}) => {
  const appointment = {
    id: target.appointmentId ?? target.appointment_id,
    startsAt: target.startsAt ?? target.starts_at ?? target.canonicalStartAt,
    startTime: target.startTime ?? target.start_time,
    sessionDate: target.sessionDate ?? target.session_date,
    scheduleTimezone: target.scheduleTimezone ?? target.schedule_timezone,
    rsvpStatus: target.rsvpStatus ?? target.rsvp_status,
  }

  const notificationType =
    target.notificationType ?? target.notification_type ??
    (target.recipientRole === 'coach' || target.recipient_role === 'coach'
      ? APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H
      : APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H)

  const copy = buildAppointmentNotificationCopy({
    type: notificationType,
    appointment,
    athleteDisplayName: athleteLabel,
  })

  const action =
    target.recipientRole === 'coach' || target.recipient_role === 'coach'
      ? 'open-coach-calendar'
      : 'open-appointment-detail'

  return buildAppointmentPushPayload({
    title: copy.title,
    body: copy.body,
    action,
    payload: {
      scheduledSessionId: appointment.id,
      startsAt: appointment.startsAt,
      scheduleTimezone: appointment.scheduleTimezone,
    },
    notificationType,
    scheduledSessionId: appointment.id,
    dedupeKey: target.dedupeKey ?? target.dedupe_key ?? null,
  })
}

export const resolvePushDeliveryOutcome = ({
  subscriptionCount = 0,
  deliveredCount = 0,
  hadTransientFailure = false,
} = {}) => {
  if (subscriptionCount === 0) {
    return {
      status: DELIVERY_STATUS.SKIPPED,
      error: 'no_active_push_subscription',
      retryable: false,
    }
  }

  if (deliveredCount > 0) {
    return {
      status: DELIVERY_STATUS.SENT,
      error: null,
      retryable: false,
    }
  }

  if (hadTransientFailure) {
    return {
      status: DELIVERY_STATUS.FAILED,
      error: 'push_delivery_failed',
      retryable: true,
    }
  }

  return {
    status: DELIVERY_STATUS.SKIPPED,
    error: 'no_deliverable_push_subscription',
    retryable: false,
  }
}

export const shouldUseReminderCompletionRpc = (notificationType) =>
  isReminderAppointmentNotificationType(notificationType)

export const fanOutPushResults = (results = []) => ({
  subscriptionCount: results.length,
  deliveredCount: results.filter((entry) => entry.success).length,
  hadTransientFailure: results.some(
    (entry) => !entry.success && !entry.invalidSubscription,
  ),
  invalidSubscriptionIds: results
    .filter((entry) => entry.invalidSubscription)
    .map((entry) => entry.subscriptionId),
})
