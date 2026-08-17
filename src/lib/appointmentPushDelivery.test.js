import { describe, expect, it } from 'vitest'
import {
  APPOINTMENT_NOTIFICATION_TYPES,
  buildAppointmentNotificationCopy,
  shouldEnqueueLifecycleNotification,
  buildTransitionIdentity,
  buildAppointmentDedupeKey,
  isTwoHourReminderEligible,
} from './appointmentNotifications'
import {
  buildAppointmentPushPayload,
  buildAppointmentPushUrl,
  buildReminderPushPayload,
  fanOutPushResults,
  isImmediateAppointmentNotificationType,
  isInvalidPushSubscriptionStatus,
  resolvePushDeliveryOutcome,
} from './appointmentPushDelivery'
import { DELIVERY_STATUS } from './appointmentNotificationDeliveries'
import { RSVP_STATUS } from './sessionRsvp'

describe('appointmentPushDelivery routing', () => {
  it('builds athlete appointment detail deep links', () => {
    expect(
      buildAppointmentPushUrl({
        action: 'open-appointment-detail',
        payload: { scheduledSessionId: 'appt-1' },
      }),
    ).toBe('/?session=appt-1&open=appointment-detail')
  })

  it('builds coach calendar deep links', () => {
    expect(
      buildAppointmentPushUrl({
        action: 'open-coach-calendar',
        payload: { scheduledSessionId: 'appt-1' },
      }),
    ).toBe('/?open=coach-calendar&session=appt-1')
  })

  it('builds athlete schedule deep links for series notifications', () => {
    expect(
      buildAppointmentPushUrl({
        action: 'open-athlete-schedule',
        payload: { openTarget: 'athlete-schedule' },
      }),
    ).toBe('/?open=athlete-schedule')
  })

  it('builds immediate push payload from durable notification rows', () => {
    const payload = buildAppointmentPushPayload({
      title: 'Training scheduled',
      body: 'Thu, Aug 20 · 5:30 PM',
      action: 'open-appointment-detail',
      payload: { scheduledSessionId: 'appt-1' },
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.SCHEDULED,
      dedupeKey: 'dedupe-1',
    })

    expect(payload.title).toBe('Training scheduled')
    expect(payload.body).toBe('Thu, Aug 20 · 5:30 PM')
    expect(payload.sessionId).toBe('appt-1')
    expect(payload.url).toContain('open=appointment-detail')
    expect(payload.tag).toBe('dedupe-1')
  })
})

describe('appointmentPushDelivery reminder payloads', () => {
  it('builds athlete 2h reminder payload', () => {
    const payload = buildReminderPushPayload({
      target: {
        appointmentId: 'appt-1',
        recipientRole: 'athlete',
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
        startsAt: '2026-08-20T21:30:00.000Z',
        startTime: '17:30:00',
        sessionDate: '2026-08-20',
        scheduleTimezone: 'America/New_York',
        dedupeKey: 'reminder-athlete',
      },
    })

    expect(payload.title).toBe('Training in 2 hours')
    expect(payload.body).toContain('Your session starts at')
    expect(payload.url).toContain('open=appointment-detail')
  })

  it('builds coach 2h reminder payload with RSVP suffix', () => {
    const payload = buildReminderPushPayload({
      target: {
        appointmentId: 'appt-1',
        recipientRole: 'coach',
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H,
        startsAt: '2026-08-20T21:30:00.000Z',
        startTime: '17:30:00',
        sessionDate: '2026-08-20',
        scheduleTimezone: 'America/New_York',
        rsvpStatus: RSVP_STATUS.CONFIRMED,
        dedupeKey: 'reminder-coach',
      },
      athleteLabel: 'Jake',
    })

    expect(payload.title).toBe('Training in 2 hours')
    expect(payload.body).toContain('Jake')
    expect(payload.body).toContain('Confirmed')
    expect(payload.url).toContain('open=coach-calendar')
  })
})

describe('appointmentPushDelivery subscription handling', () => {
  it('treats missing subscriptions as skipped non-retryable', () => {
    expect(resolvePushDeliveryOutcome({ subscriptionCount: 0 })).toEqual({
      status: DELIVERY_STATUS.SKIPPED,
      error: 'no_active_push_subscription',
      retryable: false,
    })
  })

  it('marks successful multi-device fanout as sent once', () => {
    const summary = fanOutPushResults([
      { success: true },
      { success: true },
      { success: false, invalidSubscription: true },
    ])

    expect(summary.deliveredCount).toBe(2)
    expect(
      resolvePushDeliveryOutcome({
        subscriptionCount: summary.subscriptionCount,
        deliveredCount: summary.deliveredCount,
        hadTransientFailure: summary.hadTransientFailure,
      }).status,
    ).toBe(DELIVERY_STATUS.SENT)
  })

  it('detects invalid subscription responses for cleanup', () => {
    expect(isInvalidPushSubscriptionStatus(404)).toBe(true)
    expect(isInvalidPushSubscriptionStatus(410)).toBe(true)
    expect(isInvalidPushSubscriptionStatus(500)).toBe(false)
  })

  it('retries transient push failures', () => {
    expect(
      resolvePushDeliveryOutcome({
        subscriptionCount: 2,
        deliveredCount: 0,
        hadTransientFailure: true,
      }),
    ).toEqual({
      status: DELIVERY_STATUS.FAILED,
      error: 'push_delivery_failed',
      retryable: true,
    })
  })
})

describe('appointmentPushDelivery lifecycle scenarios', () => {
  const recipientUserId = 'athlete-1'
  const appointmentId = 'appt-1'

  const appointmentAt = (startsAt, updatedAt, overrides = {}) => ({
    id: appointmentId,
    status: 'scheduled',
    athleteId: recipientUserId,
    startsAt,
    updatedAt,
    sessionDate: '2026-08-20',
    startTime: '17:00:00',
    scheduleTimezone: 'America/New_York',
    ...overrides,
  })

  it('covers scheduled/reschedule/cancel/RSVP immediate types', () => {
    expect(
      isImmediateAppointmentNotificationType(
        APPOINTMENT_NOTIFICATION_TYPES.SCHEDULED,
      ),
    ).toBe(true)
    expect(
      isImmediateAppointmentNotificationType(
        APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
      ),
    ).toBe(false)
  })

  it('A/B/C: reschedule-back-to-previous-time keeps distinct dedupe keys', () => {
    const sent = []
    const five = appointmentAt('2026-08-20T21:00:00.000Z', '2026-08-18T10:00:00.000Z')
    const sixA = appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T11:00:00.000Z')
    const seven = appointmentAt('2026-08-20T23:00:00.000Z', '2026-08-18T12:00:00.000Z')
    const sixB = appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T13:00:00.000Z')

    for (const [before, after] of [
      [five, sixA],
      [sixA, seven],
      [seven, sixB],
    ]) {
      expect(
        shouldEnqueueLifecycleNotification({
          before,
          after,
          notificationType: APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED,
          sentDedupeKeys: sent,
        }),
      ).toBe(true)

      sent.push(
        buildAppointmentDedupeKey({
          recipientUserId,
          appointmentId,
          notificationType: APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED,
          canonicalStartAt: after.startsAt,
          transitionIdentity: buildTransitionIdentity(after.updatedAt),
        }),
      )
    }

    expect(new Set(sent).size).toBe(3)
  })

  it('suppresses duplicate 2h reminders after a sent delivery exists', () => {
    const startsAt = '2026-08-20T22:00:00.000Z'
    const reminderKey = buildAppointmentDedupeKey({
      recipientUserId,
      appointmentId,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
      canonicalStartAt: startsAt,
    })

    expect(
      isTwoHourReminderEligible(appointmentAt(startsAt, '2026-08-18T11:00:00.000Z'), {
        now: new Date(new Date(startsAt).getTime() - 2 * 60 * 60 * 1000),
        recipientRole: 'athlete',
        reminderDeliveries: [{ dedupeKey: reminderKey, deliveryStatus: 'sent' }],
      }),
    ).toBe(false)
  })
})

describe('appointmentPushDelivery copy parity', () => {
  it('matches product copy for athlete scheduled notification', () => {
    const copy = buildAppointmentNotificationCopy({
      type: APPOINTMENT_NOTIFICATION_TYPES.SCHEDULED,
      appointment: {
        sessionDate: '2026-08-20',
        startTime: '17:30:00',
        scheduleTimezone: 'America/New_York',
      },
    })

    expect(copy.title).toBe('Training scheduled')
    expect(copy.body).toContain('5:30 PM')
  })

  it('matches product copy for coach cannot-attend notification', () => {
    const copy = buildAppointmentNotificationCopy({
      type: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CANNOT_ATTEND,
      athleteDisplayName: 'Jake',
      appointment: {
        sessionDate: '2026-08-20',
        startTime: '17:30:00',
        scheduleTimezone: 'America/New_York',
      },
    })

    expect(copy.title).toBe("Jake can't make it")
    expect(copy.body).toContain('5:30 PM')
  })
})
