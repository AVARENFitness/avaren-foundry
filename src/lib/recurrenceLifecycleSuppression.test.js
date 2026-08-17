import { describe, expect, it } from 'vitest'
import {
  shouldCreateAthleteScheduledNotification,
  shouldCreateAthleteRescheduledNotification,
  shouldCreateAthleteCancelledNotification,
} from './appointmentNotifications'
import { shouldSuppressOccurrenceScheduledNotification } from './appointmentSeriesNotifications'

describe('recurrence lifecycle suppression', () => {
  const connectedAppointment = (overrides = {}) => ({
    id: 'appt-1',
    status: 'scheduled',
    athleteId: 'athlete-1',
    coachId: 'coach-1',
    sessionDate: '2026-08-20',
    startTime: '17:30:00',
    startsAt: '2026-08-20T21:30:00.000Z',
    ...overrides,
  })

  it('still allows normal one-occurrence scheduled notifications', () => {
    expect(
      shouldCreateAthleteScheduledNotification({
        appointment: connectedAppointment(),
        isInsert: true,
      }),
    ).toBe(true)
  })

  it('still allows normal one-occurrence reschedule notifications', () => {
    expect(
      shouldCreateAthleteRescheduledNotification({
        before: connectedAppointment(),
        after: connectedAppointment({ startTime: '18:00:00' }),
      }),
    ).toBe(true)
  })

  it('still allows normal one-occurrence cancellation notifications', () => {
    expect(
      shouldCreateAthleteCancelledNotification({
        before: connectedAppointment(),
        after: connectedAppointment({ status: 'cancelled' }),
      }),
    ).toBe(true)
  })

  it('suppresses per-occurrence scheduled notifications for recurring rows', () => {
    expect(
      shouldSuppressOccurrenceScheduledNotification({
        recurrenceSeriesId: 'series-1',
      }),
    ).toBe(true)

    expect(
      shouldCreateAthleteScheduledNotification({
        appointment: connectedAppointment({ recurrenceSeriesId: 'series-1' }),
        isInsert: true,
      }),
    ).toBe(false)
  })
})
