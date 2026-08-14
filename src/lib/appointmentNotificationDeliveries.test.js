import { describe, expect, it } from 'vitest'
import { submitAppointmentScheduleConflict } from './appointmentScheduleConflict'
import {
  ALL_COACH_NOTIFICATION_TYPES,
  LEGACY_COACH_NOTIFICATION_TYPES,
  APPOINTMENT_COACH_NOTIFICATION_TYPES,
  claimDelivery,
  completeDelivery,
  DEFAULT_CLAIM_TTL_MS,
  DELIVERY_STATUS,
  hasSuccessfulDelivery,
  invalidateStaleReminderDeliveries,
  isDeliveryClaimable,
  resetReminderCompatibilityMarkers,
  shouldResetReminderCompatibilityMarkers,
  buildRsvpTransitionDedupeKey,
  buildReminderDedupeKey,
  resolveReminderMarkerFieldOnCompletion,
  REMINDER_MARKER_FIELDS,
} from './appointmentNotificationDeliveries'
import {
  APPOINTMENT_NOTIFICATION_TYPES,
  buildAppointmentDedupeKey,
  isTwoHourReminderEligible,
} from './appointmentNotifications'
import { RSVP_STATUS } from './sessionRsvp'

const connectedAppointment = (overrides = {}) => ({
  id: 'appt-1',
  status: 'scheduled',
  athleteId: 'athlete-1',
  coachId: 'coach-1',
  startsAt: '2026-08-20T21:30:00.000Z',
  scheduleTimezone: 'America/New_York',
  rsvpStatus: RSVP_STATUS.AWAITING,
  ...overrides,
})

const twoHoursBefore = (startsAt) =>
  new Date(new Date(startsAt).getTime() - 2 * 60 * 60 * 1000)

describe('appointmentNotificationDeliveries claim lifecycle', () => {
  it('claims pending delivery and sets TTL expiration', () => {
    const now = new Date('2026-08-20T19:30:00.000Z')
    const claimed = claimDelivery(
      { dedupeKey: 'key-1', deliveryStatus: DELIVERY_STATUS.PENDING },
      now,
    )

    expect(claimed.deliveryStatus).toBe(DELIVERY_STATUS.CLAIMED)
    expect(new Date(claimed.claimExpiresAt).getTime()).toBe(
      now.getTime() + DEFAULT_CLAIM_TTL_MS,
    )
  })

  it('reclaims expired claimed delivery after worker crash', () => {
    const now = new Date('2026-08-20T19:40:00.000Z')
    const expired = {
      dedupeKey: 'key-1',
      deliveryStatus: DELIVERY_STATUS.CLAIMED,
      claimExpiresAt: '2026-08-20T19:35:00.000Z',
    }

    expect(isDeliveryClaimable(expired, now)).toBe(true)
    expect(claimDelivery(expired, now).claimedAt).toBe(now.toISOString())
  })

  it('does not reclaim active unexpired claims', () => {
    const now = new Date('2026-08-20T19:32:00.000Z')
    const active = {
      deliveryStatus: DELIVERY_STATUS.CLAIMED,
      claimExpiresAt: '2026-08-20T19:40:00.000Z',
    }

    expect(isDeliveryClaimable(active, now)).toBe(false)
  })

  it('marks failed delivery retryable and successful delivery terminal', () => {
    const failed = completeDelivery(
      { dedupeKey: 'key-1', deliveryStatus: DELIVERY_STATUS.CLAIMED },
      { success: false, error: 'push_failed' },
    )
    expect(failed.deliveryStatus).toBe(DELIVERY_STATUS.FAILED)
    expect(isDeliveryClaimable(failed)).toBe(true)

    const sent = completeDelivery(failed, { success: true })
    expect(sent.deliveryStatus).toBe(DELIVERY_STATUS.SENT)
    expect(isDeliveryClaimable(sent)).toBe(false)
    expect(hasSuccessfulDelivery([sent], 'key-1')).toBe(true)
  })

  it('allows only one successful push across two scheduler runs', () => {
    const deliveries = []
    const now = twoHoursBefore('2026-08-20T21:30:00.000Z')
    const appointment = connectedAppointment()
    const dedupeKey = buildReminderDedupeKey({
      recipientUserId: 'athlete-1',
      appointmentId: appointment.id,
      recipientRole: 'athlete',
      canonicalStartAt: appointment.startsAt,
    })

    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'athlete',
        reminderDeliveries: deliveries,
      }),
    ).toBe(true)

    deliveries.push(
      completeDelivery(
        claimDelivery({ dedupeKey, deliveryStatus: DELIVERY_STATUS.PENDING }),
        { success: true },
      ),
    )

    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'athlete',
        reminderDeliveries: deliveries,
      }),
    ).toBe(false)
  })

  it('retries after failed push and succeeds once', () => {
    const dedupeKey = 'athlete:appt:reminder:start'
    let delivery = claimDelivery({
      dedupeKey,
      deliveryStatus: DELIVERY_STATUS.PENDING,
    })

    delivery = completeDelivery(delivery, { success: false, error: 'network' })
    expect(delivery.deliveryStatus).toBe(DELIVERY_STATUS.FAILED)

    delivery = claimDelivery(delivery)
    delivery = completeDelivery(delivery, { success: true })

    expect(delivery.deliveryStatus).toBe(DELIVERY_STATUS.SENT)
    expect(delivery.attemptCount).toBe(2)
  })
})

describe('appointmentNotificationDeliveries reschedule invalidation', () => {
  it('resets both athlete and coach reminder compatibility markers', () => {
    const before = connectedAppointment({
      reminderSentAt: '2026-08-19T10:00:00.000Z',
      coachReminderSentAt: '2026-08-19T10:00:00.000Z',
    })
    const after = connectedAppointment({
      startsAt: '2026-08-21T20:00:00.000Z',
      sessionDate: '2026-08-21',
      startTime: '16:00:00',
    })

    expect(shouldResetReminderCompatibilityMarkers(before, after)).toBe(true)
    expect(resetReminderCompatibilityMarkers(after)).toEqual(
      expect.objectContaining({
        reminderSentAt: null,
        coachReminderSentAt: null,
      }),
    )
  })

  it('invalidates stale reminder deliveries for the old canonical start', () => {
    const before = connectedAppointment()
    const after = connectedAppointment({
      startsAt: '2026-08-21T20:00:00.000Z',
    })

    const deliveries = invalidateStaleReminderDeliveries(
      [
        {
          notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
          canonicalStartAt: before.startsAt,
          deliveryStatus: DELIVERY_STATUS.CLAIMED,
        },
        {
          notificationType: APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H,
          canonicalStartAt: before.startsAt,
          deliveryStatus: DELIVERY_STATUS.FAILED,
        },
      ],
      { before, after },
    )

    expect(deliveries.every((entry) => entry.deliveryStatus === DELIVERY_STATUS.SKIPPED)).toBe(
      true,
    )
  })

  it('allows new athlete and coach reminders after reschedule', () => {
    const before = connectedAppointment()
    const after = connectedAppointment({
      startsAt: '2026-08-21T20:00:00.000Z',
      sessionDate: '2026-08-21',
      startTime: '16:00:00',
    })
    const now = twoHoursBefore(after.startsAt)

    const oldAthleteKey = buildAppointmentDedupeKey({
      recipientUserId: 'athlete-1',
      appointmentId: before.id,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
      canonicalStartAt: before.startsAt,
    })
    const oldCoachKey = buildAppointmentDedupeKey({
      recipientUserId: 'coach-1',
      appointmentId: before.id,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H,
      canonicalStartAt: before.startsAt,
    })

    const deliveries = [
      { dedupeKey: oldAthleteKey, deliveryStatus: DELIVERY_STATUS.SENT },
      { dedupeKey: oldCoachKey, deliveryStatus: DELIVERY_STATUS.SENT },
    ]

    expect(
      isTwoHourReminderEligible(after, {
        now,
        recipientRole: 'athlete',
        reminderDeliveries: deliveries,
      }),
    ).toBe(true)
    expect(
      isTwoHourReminderEligible(after, {
        now,
        recipientRole: 'coach',
        reminderDeliveries: deliveries,
      }),
    ).toBe(true)
  })
})

describe('appointmentNotificationDeliveries RSVP transition dedupe', () => {
  it('creates distinct keys for each real RSVP transition', () => {
    const base = {
      recipientUserId: 'coach-1',
      appointmentId: 'appt-1',
      canonicalStartAt: '2026-08-20T21:30:00.000Z',
    }

    const awaitingToConfirmed = buildRsvpTransitionDedupeKey({
      ...base,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
      rsvpTransitionAt: '2026-08-18T12:00:00.000Z',
    })
    const confirmedToCannot = buildRsvpTransitionDedupeKey({
      ...base,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CANNOT_ATTEND,
      rsvpTransitionAt: '2026-08-19T09:00:00.000Z',
    })
    const cannotToConfirmed = buildRsvpTransitionDedupeKey({
      ...base,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
      rsvpTransitionAt: '2026-08-19T15:00:00.000Z',
    })

    expect(new Set([awaitingToConfirmed, confirmedToCannot, cannotToConfirmed]).size).toBe(3)
  })

  it('retries the same transition without creating a second successful delivery', () => {
    const dedupeKey = buildRsvpTransitionDedupeKey({
      recipientUserId: 'coach-1',
      appointmentId: 'appt-1',
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
      canonicalStartAt: '2026-08-20T21:30:00.000Z',
      rsvpTransitionAt: '2026-08-18T12:00:00.000Z',
    })

    const first = completeDelivery(
      { dedupeKey, deliveryStatus: DELIVERY_STATUS.PENDING },
      { success: true },
    )

    expect(hasSuccessfulDelivery([first], dedupeKey)).toBe(true)
    expect(isDeliveryClaimable(first)).toBe(false)
  })
})

describe('appointmentNotificationDeliveries reminder marker completion guard', () => {
  it('A: athlete scheduled completion does not touch reminder_sent_at', () => {
    expect(
      resolveReminderMarkerFieldOnCompletion({
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.SCHEDULED,
        success: true,
      }),
    ).toBeNull()
  })

  it('B: athlete 2h reminder completion sets reminder_sent_at', () => {
    expect(
      resolveReminderMarkerFieldOnCompletion({
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
        success: true,
      }),
    ).toBe(REMINDER_MARKER_FIELDS.ATHLETE)
  })

  it('C: coach RSVP completion does not touch coach_reminder_sent_at', () => {
    expect(
      resolveReminderMarkerFieldOnCompletion({
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
        success: true,
      }),
    ).toBeNull()
  })

  it('D: coach 2h reminder completion sets coach_reminder_sent_at', () => {
    expect(
      resolveReminderMarkerFieldOnCompletion({
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H,
        success: true,
      }),
    ).toBe(REMINDER_MARKER_FIELDS.COACH)
  })

  it('does not update reminder markers on failed completion', () => {
    expect(
      resolveReminderMarkerFieldOnCompletion({
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
        success: false,
      }),
    ).toBeNull()
  })

  it('ignores recipient_role alone without exact reminder notification type', () => {
    expect(
      resolveReminderMarkerFieldOnCompletion({
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED,
        success: true,
      }),
    ).toBeNull()

    expect(
      resolveReminderMarkerFieldOnCompletion({
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
        success: true,
      }),
    ).toBeNull()
  })
})

describe('appointmentNotificationDeliveries notification type union', () => {
  it('preserves all legacy notification types in the expanded constraint set', () => {
    for (const type of LEGACY_COACH_NOTIFICATION_TYPES) {
      expect(ALL_COACH_NOTIFICATION_TYPES).toContain(type)
    }
  })

  it('adds only the new appointment notification types', () => {
    expect(APPOINTMENT_COACH_NOTIFICATION_TYPES).toHaveLength(7)
    for (const type of APPOINTMENT_COACH_NOTIFICATION_TYPES) {
      expect(ALL_COACH_NOTIFICATION_TYPES).toContain(type)
    }
  })
})

describe('appointmentNotificationDeliveries trigger privilege simulation', () => {
  it('models authenticated coach reschedule through trigger-side invalidation', () => {
    const before = connectedAppointment({
      reminderSentAt: '2026-08-19T10:00:00.000Z',
      coachReminderSentAt: '2026-08-19T10:00:00.000Z',
    })
    const after = connectedAppointment({
      startsAt: '2026-08-21T20:00:00.000Z',
      sessionDate: '2026-08-21',
      startTime: '16:00:00',
    })

    expect(shouldResetReminderCompatibilityMarkers(before, after)).toBe(true)

    const resetSession = resetReminderCompatibilityMarkers(after)
    expect(resetSession.reminderSentAt).toBeNull()
    expect(resetSession.coachReminderSentAt).toBeNull()

    const deliveries = invalidateStaleReminderDeliveries(
      [
        {
          notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
          canonicalStartAt: before.startsAt,
          deliveryStatus: DELIVERY_STATUS.CLAIMED,
        },
        {
          notificationType: APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H,
          canonicalStartAt: before.startsAt,
          deliveryStatus: DELIVERY_STATUS.FAILED,
        },
      ],
      { before, after },
    )

    expect(deliveries.every((entry) => entry.deliveryStatus === DELIVERY_STATUS.SKIPPED)).toBe(
      true,
    )
  })
})

describe('appointmentNotificationDeliveries schedule conflict preservation', () => {
  it('keeps schedule conflict follow-up creation in the client workflow', () => {
    expect(typeof submitAppointmentScheduleConflict).toBe('function')
  })
})
