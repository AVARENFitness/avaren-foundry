import { describe, expect, it } from 'vitest'
import { FOLLOWUP_REASON_TYPE } from './coachFollowUp'
import {
  APPOINTMENT_NOTIFICATION_TYPES,
  buildAppointmentDedupeKey,
  buildAppointmentNotificationCopy,
  buildCanonicalStartAt,
  buildTransitionIdentity,
  didMaterialScheduleChange,
  didTransitionToCancelled,
  isConnectedAthleteAppointment,
  isOfflineClientAppointment,
  isTwoHourReminderEligible,
  isWithinTwoHourReminderWindow,
  shouldCreateAthleteCancelledNotification,
  shouldCreateAthleteRescheduledNotification,
  shouldCreateAthleteScheduledNotification,
  shouldCreateCoachRsvpNotification,
  shouldEnqueueLifecycleNotification,
  shouldSuppressTwoHourReminder,
  resolveCoachRsvpNotificationType,
} from './appointmentNotifications'
import { RSVP_STATUS } from './sessionRsvp'

const connectedAppointment = (overrides = {}) => ({
  id: 'appt-1',
  status: 'scheduled',
  athleteId: 'athlete-1',
  coachId: 'coach-1',
  businessClientId: 'client-1',
  sessionDate: '2026-08-20',
  startTime: '17:30:00',
  startsAt: '2026-08-20T21:30:00.000Z',
  scheduleTimezone: 'America/New_York',
  rsvpStatus: RSVP_STATUS.AWAITING,
  ...overrides,
})

const offlineAppointment = (overrides = {}) => ({
  id: 'appt-offline',
  status: 'scheduled',
  athleteId: null,
  businessClientId: 'client-offline',
  coachId: 'coach-1',
  sessionDate: '2026-08-20',
  startTime: '17:30:00',
  startsAt: '2026-08-20T21:30:00.000Z',
  scheduleTimezone: 'America/New_York',
  ...overrides,
})

const twoHoursBefore = (startsAt) =>
  new Date(new Date(startsAt).getTime() - 2 * 60 * 60 * 1000)

describe('appointmentNotifications athlete lifecycle events', () => {
  it('creates athlete scheduled event for connected appointment create', () => {
    expect(
      shouldCreateAthleteScheduledNotification({
        appointment: connectedAppointment(),
        isInsert: true,
      }),
    ).toBe(true)
  })

  it('skips athlete scheduled event for offline client create', () => {
    expect(
      shouldCreateAthleteScheduledNotification({
        appointment: offlineAppointment(),
        isInsert: true,
      }),
    ).toBe(false)
    expect(isOfflineClientAppointment(offlineAppointment())).toBe(true)
    expect(isConnectedAthleteAppointment(offlineAppointment())).toBe(false)
  })

  it('skips athlete scheduled event for recurring series materialized rows', () => {
    expect(
      shouldCreateAthleteScheduledNotification({
        appointment: connectedAppointment({ recurrenceSeriesId: 'series-1' }),
        isInsert: true,
      }),
    ).toBe(false)
  })

  it('sends one rescheduled event when canonical start changes', () => {
    const before = connectedAppointment()
    const after = connectedAppointment({
      startsAt: '2026-08-21T20:00:00.000Z',
      sessionDate: '2026-08-21',
      startTime: '16:00:00',
    })

    expect(shouldCreateAthleteRescheduledNotification({ before, after })).toBe(true)
    expect(
      shouldCreateAthleteRescheduledNotification({
        before: after,
        after,
      }),
    ).toBe(false)
  })

  it('does not send rescheduled event for unrelated metadata updates', () => {
    const before = connectedAppointment()
    const after = connectedAppointment({
      coachNote: 'Bring bands',
      locationName: 'AVAREN Gym',
    })

    expect(didMaterialScheduleChange(before, after)).toBe(false)
    expect(shouldCreateAthleteRescheduledNotification({ before, after })).toBe(false)
  })

  it('sends one cancelled event when status transitions to cancelled', () => {
    const before = connectedAppointment()
    const after = connectedAppointment({ status: 'cancelled' })

    expect(didTransitionToCancelled(before, after)).toBe(true)
    expect(shouldCreateAthleteCancelledNotification({ before, after })).toBe(true)
  })

  it('dedupe keys differ when canonical start changes after reschedule', () => {
    const athleteId = 'athlete-1'
    const appointmentId = 'appt-1'
    const oldKey = buildAppointmentDedupeKey({
      recipientUserId: athleteId,
      appointmentId,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
      canonicalStartAt: '2026-08-20T21:30:00.000Z',
    })
    const newKey = buildAppointmentDedupeKey({
      recipientUserId: athleteId,
      appointmentId,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
      canonicalStartAt: '2026-08-21T20:00:00.000Z',
    })

    expect(oldKey).not.toBe(newKey)
  })
})

describe('appointmentNotifications coach RSVP transitions', () => {
  it('notifies coach on awaiting -> confirmed', () => {
    expect(
      shouldCreateCoachRsvpNotification({
        previousStatus: RSVP_STATUS.AWAITING,
        nextStatus: RSVP_STATUS.CONFIRMED,
      }),
    ).toBe(true)
    expect(resolveCoachRsvpNotificationType(RSVP_STATUS.CONFIRMED)).toBe(
      APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
    )
  })

  it('does not notify coach on confirmed -> confirmed', () => {
    expect(
      shouldCreateCoachRsvpNotification({
        previousStatus: RSVP_STATUS.CONFIRMED,
        nextStatus: RSVP_STATUS.CONFIRMED,
      }),
    ).toBe(false)
  })

  it('notifies coach on confirmed -> cannot_attend', () => {
    expect(
      shouldCreateCoachRsvpNotification({
        previousStatus: RSVP_STATUS.CONFIRMED,
        nextStatus: RSVP_STATUS.CANNOT_ATTEND,
      }),
    ).toBe(true)
    expect(resolveCoachRsvpNotificationType(RSVP_STATUS.CANNOT_ATTEND)).toBe(
      APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CANNOT_ATTEND,
    )
  })

  it('does not notify coach on cannot_attend -> cannot_attend', () => {
    expect(
      shouldCreateCoachRsvpNotification({
        previousStatus: RSVP_STATUS.CANNOT_ATTEND,
        nextStatus: RSVP_STATUS.CANNOT_ATTEND,
      }),
    ).toBe(false)
  })

  it('notifies coach on cannot_attend -> confirmed with a new transition key', () => {
    expect(
      shouldCreateCoachRsvpNotification({
        previousStatus: RSVP_STATUS.CANNOT_ATTEND,
        nextStatus: RSVP_STATUS.CONFIRMED,
      }),
    ).toBe(true)

    const firstConfirmed = buildAppointmentDedupeKey({
      recipientUserId: 'coach-1',
      appointmentId: 'appt-1',
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
      canonicalStartAt: '2026-08-20T21:30:00.000Z',
      rsvpTransitionAt: '2026-08-18T12:00:00.000Z',
    })
    const secondConfirmed = buildAppointmentDedupeKey({
      recipientUserId: 'coach-1',
      appointmentId: 'appt-1',
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
      canonicalStartAt: '2026-08-20T21:30:00.000Z',
      rsvpTransitionAt: '2026-08-19T15:00:00.000Z',
    })

    expect(firstConfirmed).not.toBe(secondConfirmed)
  })
})

describe('appointmentNotifications 2-hour reminders', () => {
  const openConflict = [
    {
      status: 'open',
      reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
      scheduledSessionId: 'appt-1',
    },
  ]

  it('allows athlete and coach reminders in the 2-hour window', () => {
    const appointment = connectedAppointment()
    const now = twoHoursBefore(appointment.startsAt)

    expect(isWithinTwoHourReminderWindow(appointment, now)).toBe(true)
    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'athlete',
      }),
    ).toBe(true)
    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'coach',
      }),
    ).toBe(true)
  })

  it('prevents duplicate reminders on scheduler rerun after successful send', () => {
    const appointment = connectedAppointment()
    const now = twoHoursBefore(appointment.startsAt)
    const dedupeKey = buildAppointmentDedupeKey({
      recipientUserId: 'athlete-1',
      appointmentId: appointment.id,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
      canonicalStartAt: buildCanonicalStartAt(appointment),
    })

    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'athlete',
        reminderDeliveries: [{ dedupeKey, deliveryStatus: 'sent' }],
      }),
    ).toBe(false)
  })

  it('allows retry when prior reminder delivery failed', () => {
    const appointment = connectedAppointment()
    const now = twoHoursBefore(appointment.startsAt)
    const dedupeKey = buildAppointmentDedupeKey({
      recipientUserId: 'athlete-1',
      appointmentId: appointment.id,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
      canonicalStartAt: buildCanonicalStartAt(appointment),
    })

    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'athlete',
        reminderDeliveries: [{ dedupeKey, deliveryStatus: 'failed' }],
      }),
    ).toBe(true)
  })

  it('excludes cancelled, completed, and missed appointments', () => {
    const now = twoHoursBefore('2026-08-20T21:30:00.000Z')

    for (const status of ['cancelled', 'completed', 'missed']) {
      expect(
        isTwoHourReminderEligible(connectedAppointment({ status }), {
          now,
          recipientRole: 'athlete',
        }),
      ).toBe(false)
    }
  })

  it('excludes offline athletes and unlinked appointments', () => {
    const now = twoHoursBefore('2026-08-20T21:30:00.000Z')

    expect(
      isTwoHourReminderEligible(offlineAppointment(), {
        now,
        recipientRole: 'athlete',
      }),
    ).toBe(false)
  })

  it('still reminds when RSVP is confirmed or awaiting response', () => {
    const now = twoHoursBefore('2026-08-20T21:30:00.000Z')

    expect(
      isTwoHourReminderEligible(
        connectedAppointment({ rsvpStatus: RSVP_STATUS.CONFIRMED }),
        { now, recipientRole: 'athlete' },
      ),
    ).toBe(true)

    expect(
      isTwoHourReminderEligible(
        connectedAppointment({ rsvpStatus: RSVP_STATUS.AWAITING }),
        { now, recipientRole: 'coach' },
      ),
    ).toBe(true)
  })

  it('suppresses reminders for unresolved cannot_attend conflict', () => {
    const appointment = connectedAppointment({
      rsvpStatus: RSVP_STATUS.CANNOT_ATTEND,
    })
    const now = twoHoursBefore(appointment.startsAt)

    expect(shouldSuppressTwoHourReminder(appointment, { openFollowUps: openConflict })).toBe(
      true,
    )
    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'athlete',
        openFollowUps: openConflict,
      }),
    ).toBe(false)
    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'coach',
        openFollowUps: openConflict,
      }),
    ).toBe(false)
  })

  it('allows a new reminder after reschedule invalidates the old canonical start', () => {
    const before = connectedAppointment()
    const rescheduled = connectedAppointment({
      startsAt: '2026-08-21T20:00:00.000Z',
      sessionDate: '2026-08-21',
      startTime: '16:00:00',
    })
    const now = twoHoursBefore(rescheduled.startsAt)
    const oldDelivery = {
      dedupeKey: buildAppointmentDedupeKey({
        recipientUserId: 'athlete-1',
        appointmentId: before.id,
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
        canonicalStartAt: buildCanonicalStartAt(before),
      }),
      deliveryStatus: 'sent',
    }

    expect(didMaterialScheduleChange(before, rescheduled)).toBe(true)
    expect(
      isTwoHourReminderEligible(rescheduled, {
        now,
        recipientRole: 'athlete',
        reminderDeliveries: [oldDelivery],
      }),
    ).toBe(true)
  })

  it('restores reminder eligibility after conflict follow-up is resolved', () => {
    const appointment = connectedAppointment({
      rsvpStatus: RSVP_STATUS.CANNOT_ATTEND,
    })
    const now = twoHoursBefore(appointment.startsAt)

    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'athlete',
        openFollowUps: [
          {
            status: 'open',
            reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
            scheduledSessionId: appointment.id,
          },
        ],
      }),
    ).toBe(false)

    expect(
      isTwoHourReminderEligible(appointment, {
        now,
        recipientRole: 'athlete',
        openFollowUps: [
          {
            status: 'resolved',
            reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
            scheduledSessionId: appointment.id,
          },
        ],
      }),
    ).toBe(true)
  })
})

describe('appointmentNotifications lifecycle transition dedupe', () => {
  const recipientUserId = 'athlete-1'
  const appointmentId = 'appt-1'

  const appointmentAt = (startsAt, updatedAt, overrides = {}) => ({
    id: appointmentId,
    status: 'scheduled',
    athleteId: recipientUserId,
    startsAt,
    updatedAt,
    ...overrides,
  })

  const simulateScheduleEnqueue = (appointment, sentDedupeKeys) => {
    if (
      !shouldCreateAthleteScheduledNotification({
        appointment,
        isInsert: true,
      })
    ) {
      return false
    }

    const dedupeKey = buildAppointmentDedupeKey({
      recipientUserId,
      appointmentId,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.SCHEDULED,
      canonicalStartAt: buildCanonicalStartAt(appointment),
    })

    if (sentDedupeKeys.includes(dedupeKey)) return false

    sentDedupeKeys.push(dedupeKey)
    return true
  }

  it('8.10.10: connected schedule enqueue succeeds once and dedupes duplicate trigger', () => {
    const sent = []
    const appointment = appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T11:00:00.000Z')

    expect(simulateScheduleEnqueue(appointment, sent)).toBe(true)
    expect(simulateScheduleEnqueue(appointment, sent)).toBe(false)
  })

  it('8.10.10: offline client schedule does not enqueue athlete notification', () => {
    const sent = []
    const appointment = {
      ...appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T11:00:00.000Z'),
      athleteId: null,
      businessClientId: 'client-offline',
    }

    expect(simulateScheduleEnqueue(appointment, sent)).toBe(false)
    expect(sent).toEqual([])
  })

  const enqueueReschedule = (before, after, sentDedupeKeys) =>
    shouldEnqueueLifecycleNotification({
      before,
      after,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED,
      sentDedupeKeys,
    })

  const recordReschedule = (before, after, sentDedupeKeys) => {
    if (!enqueueReschedule(before, after, sentDedupeKeys)) return false
    sentDedupeKeys.push(
      buildAppointmentDedupeKey({
        recipientUserId,
        appointmentId,
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED,
        canonicalStartAt: after.startsAt,
        transitionIdentity: buildTransitionIdentity(after.updatedAt),
      }),
    )
    return true
  }

  it('A/B/C: 5:00 -> 6:00 -> 7:00 -> 6:00 creates three reschedule notifications', () => {
    const sent = []
    const five = appointmentAt('2026-08-20T21:00:00.000Z', '2026-08-18T10:00:00.000Z')
    const sixA = appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T11:00:00.000Z')
    const seven = appointmentAt('2026-08-20T23:00:00.000Z', '2026-08-18T12:00:00.000Z')
    const sixB = appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T13:00:00.000Z')

    expect(recordReschedule(five, sixA, sent)).toBe(true)
    expect(recordReschedule(sixA, seven, sent)).toBe(true)
    expect(recordReschedule(seven, sixB, sent)).toBe(true)
    expect(sent).toHaveLength(3)
    expect(new Set(sent).size).toBe(3)
  })

  it('D: saving the same 6:00 schedule again creates no additional notification', () => {
    const sent = []
    const five = appointmentAt('2026-08-20T21:00:00.000Z', '2026-08-18T10:00:00.000Z')
    const six = appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T11:00:00.000Z')

    expect(recordReschedule(five, six, sent)).toBe(true)
    expect(enqueueReschedule(six, six, sent)).toBe(false)
    expect(enqueueReschedule(six, { ...six, coachNote: 'Bring bands' }, sent)).toBe(false)
  })

  it('E/F: scheduled -> cancelled once; cancelled -> cancelled no duplicate', () => {
    const sent = []
    const scheduled = appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T11:00:00.000Z')
    const cancelled = {
      ...scheduled,
      status: 'cancelled',
      updatedAt: '2026-08-18T14:00:00.000Z',
    }

    expect(
      shouldEnqueueLifecycleNotification({
        before: scheduled,
        after: cancelled,
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
        sentDedupeKeys: sent,
      }),
    ).toBe(true)

    sent.push(
      buildAppointmentDedupeKey({
        recipientUserId,
        appointmentId,
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
        canonicalStartAt: cancelled.startsAt,
        transitionIdentity: buildTransitionIdentity(cancelled.updatedAt),
      }),
    )

    expect(
      shouldEnqueueLifecycleNotification({
        before: cancelled,
        after: cancelled,
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
        sentDedupeKeys: sent,
      }),
    ).toBe(false)
  })

  it('G: cancelled -> scheduled -> cancelled notifies on the second cancellation', () => {
    const sent = []
    const scheduled = appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T11:00:00.000Z')
    const cancelledFirst = {
      ...scheduled,
      status: 'cancelled',
      updatedAt: '2026-08-18T14:00:00.000Z',
    }
    const scheduledAgain = {
      ...scheduled,
      status: 'scheduled',
      updatedAt: '2026-08-18T15:00:00.000Z',
    }
    const cancelledSecond = {
      ...scheduledAgain,
      status: 'cancelled',
      updatedAt: '2026-08-18T16:00:00.000Z',
    }

    expect(
      shouldEnqueueLifecycleNotification({
        before: scheduled,
        after: cancelledFirst,
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
        sentDedupeKeys: sent,
      }),
    ).toBe(true)

    sent.push(
      buildAppointmentDedupeKey({
        recipientUserId,
        appointmentId,
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
        canonicalStartAt: cancelledFirst.startsAt,
        transitionIdentity: buildTransitionIdentity(cancelledFirst.updatedAt),
      }),
    )

    expect(
      shouldEnqueueLifecycleNotification({
        before: scheduledAgain,
        after: cancelledSecond,
        notificationType: APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
        sentDedupeKeys: sent,
      }),
    ).toBe(true)
  })

  it('H: 2h reminder dedupe ignores transition identity and sends once per start', () => {
    const reminderKey = buildAppointmentDedupeKey({
      recipientUserId,
      appointmentId,
      notificationType: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
      canonicalStartAt: '2026-08-20T22:00:00.000Z',
      transitionIdentity: 'ignored-if-passed',
    })

    expect(reminderKey).not.toContain('ignored-if-passed')
    expect(
      isTwoHourReminderEligible(appointmentAt('2026-08-20T22:00:00.000Z', '2026-08-18T11:00:00.000Z'), {
        now: twoHoursBefore('2026-08-20T22:00:00.000Z'),
        recipientRole: 'athlete',
        reminderDeliveries: [{ dedupeKey: reminderKey, deliveryStatus: 'sent' }],
      }),
    ).toBe(false)
  })
})

describe('appointmentNotifications copy', () => {
  it('uses concise copy for athlete scheduled/rescheduled/cancelled/reminder', () => {
    const appointment = connectedAppointment()

    expect(
      buildAppointmentNotificationCopy({
        type: APPOINTMENT_NOTIFICATION_TYPES.SCHEDULED,
        appointment,
      }).title,
    ).toBe('Training scheduled')

    expect(
      buildAppointmentNotificationCopy({
        type: APPOINTMENT_NOTIFICATION_TYPES.RESCHEDULED,
        appointment,
      }).title,
    ).toBe('Training rescheduled')

    expect(
      buildAppointmentNotificationCopy({
        type: APPOINTMENT_NOTIFICATION_TYPES.CANCELLED,
        appointment,
      }).title,
    ).toBe('Training cancelled')

    expect(
      buildAppointmentNotificationCopy({
        type: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
        appointment,
      }),
    ).toEqual({
      title: 'Training in 2 hours',
      body: expect.stringContaining('Your session starts at'),
    })
  })

  it('uses athlete name for coach RSVP and reminder copy', () => {
    const appointment = connectedAppointment({ rsvpStatus: RSVP_STATUS.CONFIRMED })

    expect(
      buildAppointmentNotificationCopy({
        type: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CONFIRMED,
        appointment,
        athleteDisplayName: 'Jake',
      }),
    ).toEqual({
      title: 'Jake confirmed',
      body: expect.stringContaining('5:30 PM'),
    })

    expect(
      buildAppointmentNotificationCopy({
        type: APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_RSVP_CANNOT_ATTEND,
        appointment,
        athleteDisplayName: 'Jake',
      }).title,
    ).toBe("Jake can't make it")

    expect(
      buildAppointmentNotificationCopy({
        type: APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H,
        appointment,
        athleteDisplayName: 'Jake',
      }).body,
    ).toContain('Jake')
  })
})
