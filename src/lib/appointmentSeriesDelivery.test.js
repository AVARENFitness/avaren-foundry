import { describe, expect, it } from 'vitest'
import {
  APPOINTMENT_SERIES_NOTIFICATION_TYPES,
  buildSeriesCancelledNotification,
  buildSeriesCoachNotificationRow,
  buildSeriesCreatedNotification,
  buildSeriesDeliveryLedgerRow,
  buildSeriesUpdatedNotification,
  formatSeriesNotificationDedupeKey,
  shouldDeliverSeriesPushToRecipient,
  shouldEnqueueSeriesNotification,
  shouldSuppressOccurrenceScheduledNotification,
} from './appointmentSeriesNotifications'
import {
  buildAppointmentPushPayload,
  buildAppointmentPushUrl,
  isImmediateAppointmentNotificationType,
} from './appointmentPushDelivery'
import { WEEKDAY } from './recurringAppointments'

describe('appointmentSeriesDelivery', () => {
  it('creates one ledger row for series create', () => {
    const row = buildSeriesDeliveryLedgerRow({
      seriesId: 'series-1',
      recipientUserId: 'athlete-1',
      anchorAppointmentId: 'appt-1',
      notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.CREATED,
    })

    expect(row.dedupeKey).toBe('series:series-1:created')
    expect(row.recipientRole).toBe('athlete')
    expect(row.recurrenceSeriesId).toBe('series-1')
    expect(row.deliveryStatus).toBe('pending')
  })

  it('creates one in-app notification row for series create', () => {
    const row = buildSeriesCoachNotificationRow({
      seriesId: 'series-1',
      recipientUserId: 'athlete-1',
      actorUserId: 'coach-1',
      anchorAppointmentId: 'appt-1',
      notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.CREATED,
      title: 'Recurring appointments scheduled',
      body: 'Mon, Wed, Fri at 4:00 PM',
    })

    expect(row.action).toBe('open-athlete-schedule')
    expect(row.payload).toEqual({
      recurrenceSeriesId: 'series-1',
      openTarget: 'athlete-schedule',
    })
  })

  it('builds push payload supported by the immediate dispatcher', () => {
    const notification = buildSeriesCreatedNotification({
      weekdays: [WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI],
      startTime: '16:00',
    })

    const payload = buildAppointmentPushPayload({
      title: notification.title,
      body: notification.body,
      action: 'open-athlete-schedule',
      payload: { openTarget: 'athlete-schedule' },
      notificationType: notification.type,
      dedupeKey: 'series:series-1:created',
    })

    expect(isImmediateAppointmentNotificationType(notification.type)).toBe(true)
    expect(payload.url).toBe('/?open=athlete-schedule')
    expect(payload.title).toBe('Recurring appointments scheduled')
  })

  it('suppresses per-occurrence scheduled rows for recurring materialization', () => {
    expect(
      shouldSuppressOccurrenceScheduledNotification({ recurrenceSeriesId: 'series-1' }),
    ).toBe(true)
  })

  it('issues one new legitimate delivery for series update transitions', () => {
    const first = formatSeriesNotificationDedupeKey({
      seriesId: 'series-1',
      notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED,
      transitionIdentity: '2026-08-24T12:00:00.000Z',
    })
    const second = formatSeriesNotificationDedupeKey({
      seriesId: 'series-1',
      notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED,
      transitionIdentity: '2026-08-24T13:00:00.000Z',
    })

    expect(first).toBe('series:series-1:updated:2026-08-24T12:00:00.000Z')
    expect(second).not.toBe(first)
  })

  it('does not duplicate the same series update on retry', () => {
    const transition = '2026-08-24T12:00:00.000Z'
    expect(
      formatSeriesNotificationDedupeKey({
        seriesId: 'series-1',
        notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED,
        transitionIdentity: transition,
      }),
    ).toBe(
      formatSeriesNotificationDedupeKey({
        seriesId: 'series-1',
        notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED,
        transitionIdentity: transition,
      }),
    )
  })

  it('allows a second later update to notify normally', () => {
    expect(
      formatSeriesNotificationDedupeKey({
        seriesId: 'series-1',
        notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED,
        transitionIdentity: '2026-08-24T12:00:00.000Z',
      }),
    ).not.toBe(
      formatSeriesNotificationDedupeKey({
        seriesId: 'series-1',
        notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED,
        transitionIdentity: '2026-09-01T12:00:00.000Z',
      }),
    )
  })

  it('creates one cancellation delivery keyed by effective date', () => {
    expect(
      formatSeriesNotificationDedupeKey({
        seriesId: 'series-1',
        notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.CANCELLED,
        transitionIdentity: '2026-08-28',
      }),
    ).toBe('series:series-1:cancelled:2026-08-28')

    expect(buildSeriesCancelledNotification({ effectiveDate: '2026-08-28' }).body).toMatch(
      /No sessions scheduled after .*Aug 28/,
    )
  })

  it('does not deliver to offline clients without a linked athlete user', () => {
    expect(shouldEnqueueSeriesNotification({ linkedAthleteUserId: null })).toBe(false)
  })

  it('never delivers series push to the acting coach', () => {
    expect(
      shouldDeliverSeriesPushToRecipient({
        recipientUserId: 'coach-1',
        actorUserId: 'coach-1',
      }),
    ).toBe(false)
    expect(
      shouldDeliverSeriesPushToRecipient({
        recipientUserId: 'athlete-1',
        actorUserId: 'coach-1',
      }),
    ).toBe(true)
  })

  it('routes series push taps to athlete schedule', () => {
    expect(
      buildAppointmentPushUrl({
        action: 'open-athlete-schedule',
        payload: { openTarget: 'athlete-schedule' },
      }),
    ).toBe('/?open=athlete-schedule')
  })
})
