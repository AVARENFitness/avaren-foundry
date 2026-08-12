import { describe, expect, it } from 'vitest'
import {
  APPOINTMENT_STATUS,
  filterActiveAppointments,
  filterAppointmentHistory,
  partitionCoachCalendarAppointments,
  summarizeAppointmentHistory,
  coachAppointmentCardStatus,
} from './coachingAppointment'
import { RSVP_STATUS } from './sessionRsvp'

const baseAppointment = (overrides = {}) => ({
  id: 'a1',
  sessionDate: '2026-08-12',
  startTime: '09:00',
  startsAt: '2026-08-12T13:00:00.000Z',
  status: APPOINTMENT_STATUS.SCHEDULED,
  rsvpStatus: RSVP_STATUS.AWAITING,
  ...overrides,
})

describe('coaching appointment calendar helpers', () => {
  it('excludes cancelled appointments from active upcoming views', () => {
    const items = [
      baseAppointment(),
      baseAppointment({ id: 'a2', status: APPOINTMENT_STATUS.CANCELLED }),
    ]

    expect(filterActiveAppointments(items)).toHaveLength(1)
    expect(filterActiveAppointments(items)[0].id).toBe('a1')
  })

  it('keeps cancelled appointments in history summaries', () => {
    const items = [
      baseAppointment({ id: 'c1', status: APPOINTMENT_STATUS.COMPLETED }),
      baseAppointment({ id: 'c2', status: APPOINTMENT_STATUS.CANCELLED }),
      baseAppointment({ id: 'c3', status: APPOINTMENT_STATUS.MISSED }),
      baseAppointment({ id: 'c4', status: APPOINTMENT_STATUS.SCHEDULED }),
    ]

    expect(summarizeAppointmentHistory(items)).toEqual({
      completed: 1,
      cancelled: 1,
      missed: 1,
      total: 3,
    })
    expect(filterAppointmentHistory(items)).toHaveLength(3)
  })

  it('partitions coach calendar into today, this week, and upcoming', () => {
    const items = [
      baseAppointment({ id: 'today', sessionDate: '2026-08-12' }),
      baseAppointment({ id: 'week', sessionDate: '2026-08-14' }),
      baseAppointment({ id: 'future', sessionDate: '2026-08-20' }),
      baseAppointment({ id: 'cancelled', sessionDate: '2026-08-14', status: APPOINTMENT_STATUS.CANCELLED }),
    ]

    const partitions = partitionCoachCalendarAppointments(items, {
      todayKey: '2026-08-12',
      weekStartKey: '2026-08-10',
    })

    expect(partitions.today.map((item) => item.id)).toEqual(['today'])
    expect(partitions.thisWeek.map((item) => item.id)).toEqual(['week'])
    expect(partitions.upcoming.map((item) => item.id)).toEqual(['future'])
  })

  it('shows contextual card status labels', () => {
    expect(coachAppointmentCardStatus(baseAppointment())).toBe('Awaiting reply')
    expect(
      coachAppointmentCardStatus({
        ...baseAppointment(),
        rsvpStatus: RSVP_STATUS.CONFIRMED,
      }),
    ).toBe('Confirmed')
    expect(
      coachAppointmentCardStatus({
        ...baseAppointment(),
        rsvpStatus: RSVP_STATUS.CANNOT_ATTEND,
      }),
    ).toBe('Needs attention')
    expect(
      coachAppointmentCardStatus({
        ...baseAppointment(),
        status: APPOINTMENT_STATUS.CANCELLED,
      }),
    ).toBe('Cancelled')
  })
})
