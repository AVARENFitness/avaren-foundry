import { formatScheduleDateLong } from './appointmentScheduling'
import { formatRecurrenceScheduleLabel } from './recurringAppointments'
import { formatTime12Hour } from './appointmentScheduling'

export const APPOINTMENT_SERIES_NOTIFICATION_TYPES = {
  CREATED: 'appointment-series-created',
  UPDATED: 'appointment-series-updated',
  CANCELLED: 'appointment-series-cancelled',
}

export const SERIES_NOTIFICATION_ACTION = 'open-athlete-schedule'

export const buildSeriesCreatedNotification = ({
  weekdays = [],
  startTime = '',
  scheduleTimezone,
  clientName = 'Client',
} = {}) => ({
  type: APPOINTMENT_SERIES_NOTIFICATION_TYPES.CREATED,
  title: 'Recurring appointments scheduled',
  body: formatRecurrenceScheduleLabel({ weekdays, startTime, scheduleTimezone }),
  recipientRole: 'athlete',
  clientName,
})

export const buildSeriesUpdatedNotification = ({
  effectiveDate = '',
  weekdays = [],
  startTime = '',
  scheduleTimezone,
} = {}) => ({
  type: APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED,
  title: 'Recurring schedule updated',
  body: `Starting ${formatScheduleDateLong(effectiveDate)} · ${formatRecurrenceScheduleLabel({
    weekdays,
    startTime,
    scheduleTimezone,
  })}`,
  recipientRole: 'athlete',
})

export const buildSeriesCancelledNotification = ({
  effectiveDate = '',
} = {}) => ({
  type: APPOINTMENT_SERIES_NOTIFICATION_TYPES.CANCELLED,
  title: 'Recurring appointments ended',
  body: effectiveDate
    ? `No sessions scheduled after ${formatScheduleDateLong(effectiveDate)}`
    : 'No future sessions remain on this recurring schedule.',
  recipientRole: 'athlete',
})

export const shouldSuppressOccurrenceScheduledNotification = (appointment = {}) =>
  Boolean(appointment.recurrenceSeriesId ?? appointment.recurrence_series_id)

export const shouldEnqueueSeriesNotification = ({
  linkedAthleteUserId = null,
  bulkOperation = false,
} = {}) => Boolean(linkedAthleteUserId) && !bulkOperation

export const shouldDeliverSeriesPushToRecipient = ({
  recipientUserId = null,
  actorUserId = null,
} = {}) => Boolean(recipientUserId) && recipientUserId !== actorUserId

export const formatSeriesNotificationDedupeKey = ({
  seriesId = '',
  notificationType = '',
  transitionIdentity = null,
} = {}) => {
  if (notificationType === APPOINTMENT_SERIES_NOTIFICATION_TYPES.CREATED) {
    return `series:${seriesId}:created`
  }

  if (notificationType === APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED) {
    return `series:${seriesId}:updated:${transitionIdentity ?? 'initial'}`
  }

  if (notificationType === APPOINTMENT_SERIES_NOTIFICATION_TYPES.CANCELLED) {
    return `series:${seriesId}:cancelled:${transitionIdentity ?? 'initial'}`
  }

  return `series:${seriesId}:${notificationType}:${transitionIdentity ?? 'initial'}`
}

export const buildSeriesNotificationPayload = ({
  seriesId = '',
} = {}) => ({
  recurrenceSeriesId: seriesId,
  openTarget: 'athlete-schedule',
})

export const buildSeriesDeliveryLedgerRow = ({
  seriesId = '',
  recipientUserId = '',
  anchorAppointmentId = '',
  notificationType = '',
  transitionIdentity = null,
  canonicalStartAt = null,
} = {}) => ({
  recipientUserId,
  recipientRole: 'athlete',
  appointmentId: anchorAppointmentId,
  recurrenceSeriesId: seriesId,
  notificationType,
  canonicalStartAt,
  dedupeKey: formatSeriesNotificationDedupeKey({
    seriesId,
    notificationType,
    transitionIdentity,
  }),
  deliveryStatus: 'pending',
})

export const buildSeriesCoachNotificationRow = ({
  seriesId = '',
  recipientUserId = '',
  actorUserId = '',
  anchorAppointmentId = '',
  notificationType = '',
  title = '',
  body = '',
  transitionIdentity = null,
} = {}) => ({
  recipientId: recipientUserId,
  actorId: actorUserId,
  scheduledSessionId: anchorAppointmentId,
  type: notificationType,
  title,
  body,
  action: SERIES_NOTIFICATION_ACTION,
  payload: buildSeriesNotificationPayload({ seriesId }),
  dedupeKey: formatSeriesNotificationDedupeKey({
    seriesId,
    notificationType,
    transitionIdentity,
  }),
})

export const buildSingleOccurrenceRescheduleNotification = ({
  sessionDate = '',
  startTime = '',
} = {}) => ({
  type: 'appointment-rescheduled',
  title: 'Training rescheduled',
  body: `Now ${formatScheduleDateLong(sessionDate)} · ${formatTime12Hour(startTime)}`,
})

export const buildSingleOccurrenceCancelNotification = ({
  sessionDate = '',
  startTime = '',
} = {}) => ({
  type: 'appointment-cancelled',
  title: 'Training cancelled',
  body: `${formatScheduleDateLong(sessionDate)} · ${formatTime12Hour(startTime)}`,
})
