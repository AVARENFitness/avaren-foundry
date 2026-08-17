import { describe, expect, it } from 'vitest'
import {
  APPOINTMENT_SERIES_NOTIFICATION_TYPES,
  buildSeriesCancelledNotification,
  buildSeriesCreatedNotification,
  buildSeriesUpdatedNotification,
  buildSingleOccurrenceCancelNotification,
  buildSingleOccurrenceRescheduleNotification,
  formatSeriesNotificationDedupeKey,
  shouldEnqueueSeriesNotification,
  shouldSuppressOccurrenceScheduledNotification,
} from './appointmentSeriesNotifications'
import { WEEKDAY } from './recurringAppointments'

describe('appointmentSeriesNotifications', () => {
  it('uses series-created notification for linked athletes only', () => {
    const payload = buildSeriesCreatedNotification({
      weekdays: [WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI],
      startTime: '16:00',
    })

    expect(payload.type).toBe(APPOINTMENT_SERIES_NOTIFICATION_TYPES.CREATED)
    expect(payload.title).toBe('Recurring appointments scheduled')
    expect(payload.body).toMatch(/Mon, Wed, Fri at 4:00 PM/)
    expect(
      shouldEnqueueSeriesNotification({ linkedAthleteUserId: 'athlete-1' }),
    ).toBe(true)
    expect(shouldEnqueueSeriesNotification({ linkedAthleteUserId: null })).toBe(false)
  })

  it('suppresses per-occurrence scheduled notifications for series rows', () => {
    expect(
      shouldSuppressOccurrenceScheduledNotification({
        recurrenceSeriesId: 'series-1',
      }),
    ).toBe(true)
    expect(shouldSuppressOccurrenceScheduledNotification({})).toBe(false)
  })

  it('builds one series-update notification for this-and-future edits', () => {
    const payload = buildSeriesUpdatedNotification({
      effectiveDate: '2026-08-24',
      weekdays: [WEEKDAY.MON, WEEKDAY.WED, WEEKDAY.FRI],
      startTime: '17:00',
    })

    expect(payload.type).toBe(APPOINTMENT_SERIES_NOTIFICATION_TYPES.UPDATED)
    expect(payload.body).toMatch(/Starting .*Aug 24/)
    expect(payload.body).toMatch(/5:00 PM/)
  })

  it('builds one series-cancelled notification for this-and-future cancels', () => {
    const payload = buildSeriesCancelledNotification({ effectiveDate: '2026-08-28' })

    expect(payload.type).toBe(APPOINTMENT_SERIES_NOTIFICATION_TYPES.CANCELLED)
    expect(payload.body).toMatch(/No sessions scheduled after .*Aug 28/)
  })

  it('keeps single-occurrence edit notifications normal', () => {
    expect(buildSingleOccurrenceRescheduleNotification({
      sessionDate: '2026-08-24',
      startTime: '17:00',
    }).type).toBe('appointment-rescheduled')

    expect(buildSingleOccurrenceCancelNotification({
      sessionDate: '2026-08-21',
      startTime: '16:00',
    }).type).toBe('appointment-cancelled')
  })

  it('dedupes series notifications by series id and type', () => {
    expect(
      formatSeriesNotificationDedupeKey({
        seriesId: 'series-1',
        notificationType: APPOINTMENT_SERIES_NOTIFICATION_TYPES.CREATED,
      }),
    ).toBe('series:series-1:created')
  })

  it('does not enqueue series notifications during bulk materialization', () => {
    expect(
      shouldEnqueueSeriesNotification({
        linkedAthleteUserId: 'athlete-1',
        bulkOperation: true,
      }),
    ).toBe(false)
  })
})
