import { describe, expect, it } from 'vitest'
import {
  APPOINTMENT_STATUS,
  appointmentsOnDate,
  appointmentsOverlap,
  buildScheduleConflictSummaryFromAppointment,
  findAppointmentForScheduleConflict,
  findAppointmentLinkedToAssignment,
  findOverlappingAppointment,
  filterUpcomingAppointments,
  nextUpcomingAppointment,
} from './coachingAppointment'

const baseAppointment = (overrides = {}) => ({
  id: 'a1',
  coachId: 'coach-1',
  athleteId: 'athlete-1',
  sessionDate: '2026-08-11',
  startTime: '15:00',
  startsAt: '2026-08-11T19:00:00.000Z',
  durationMinutes: 60,
  status: APPOINTMENT_STATUS.SCHEDULED,
  ...overrides,
})

describe('coachingAppointment', () => {
  it('detects overlapping coach appointments', () => {
    const first = baseAppointment({ id: 'a1', startTime: '10:00', startsAt: '2026-08-11T14:00:00.000Z' })
    const second = baseAppointment({
      id: 'a2',
      athleteId: 'athlete-2',
      startTime: '10:30',
      startsAt: '2026-08-11T14:30:00.000Z',
    })

    expect(appointmentsOverlap(first, second)).toBe(true)
  })

  it('ignores cancelled appointments for overlap checks', () => {
    const first = baseAppointment()
    const second = baseAppointment({
      id: 'a2',
      status: APPOINTMENT_STATUS.CANCELLED,
    })

    expect(appointmentsOverlap(first, second)).toBe(false)
  })

  it('finds overlapping appointment in a list', () => {
    const candidate = baseAppointment({ id: 'new', startTime: '10:30', startsAt: '2026-08-11T14:30:00.000Z' })
    const existing = [
      baseAppointment({ id: 'a1', startTime: '10:00', startsAt: '2026-08-11T14:00:00.000Z' }),
    ]

    expect(findOverlappingAppointment(candidate, existing)?.id).toBe('a1')
  })

  it('returns next upcoming appointment', () => {
    const now = new Date('2026-08-09T15:00:00.000Z')
    const items = [
      baseAppointment({ id: 'past', sessionDate: '2026-08-08', startsAt: '2026-08-08T19:00:00.000Z' }),
      baseAppointment({ id: 'next', sessionDate: '2026-08-11', startsAt: '2026-08-11T19:00:00.000Z' }),
    ]

    expect(nextUpcomingAppointment(items, now)?.id).toBe('next')
  })

  it('matches schedule conflict messages to a real appointment', () => {
    const now = new Date('2026-08-09T15:00:00.000Z')
    const items = [
      baseAppointment({
        id: 'tuesday',
        sessionDate: '2026-08-11',
        startTime: '15:00',
        startsAt: '2026-08-11T19:00:00.000Z',
        linkedWorkoutTitle: 'Chest & Back',
      }),
    ]

    const match = findAppointmentForScheduleConflict(
      "I can't make Tuesday at 3",
      items,
      now,
    )

    expect(match?.id).toBe('tuesday')
    expect(buildScheduleConflictSummaryFromAppointment(match)).toContain('Tue')
    expect(buildScheduleConflictSummaryFromAppointment(match)).toContain('Chest & Back')
  })

  it('filters appointments for a specific date', () => {
    const items = [
      baseAppointment({ sessionDate: '2026-08-11' }),
      baseAppointment({ id: 'a2', sessionDate: '2026-08-13' }),
    ]

    expect(appointmentsOnDate(items, '2026-08-11')).toHaveLength(1)
  })

  it('excludes cancelled appointments from upcoming lists', () => {
    const now = new Date('2026-08-09T15:00:00.000Z')
    const items = [
      baseAppointment({ status: APPOINTMENT_STATUS.CANCELLED }),
    ]

    expect(filterUpcomingAppointments(items, now)).toHaveLength(0)
  })

  it('allows adjacent appointments without overlap', () => {
    const first = baseAppointment({
      id: 'a1',
      startTime: '10:00',
      startsAt: '2026-08-11T14:00:00.000Z',
      durationMinutes: 60,
    })
    const second = baseAppointment({
      id: 'a2',
      athleteId: 'athlete-2',
      startTime: '11:00',
      startsAt: '2026-08-11T15:00:00.000Z',
      durationMinutes: 60,
    })

    expect(appointmentsOverlap(first, second)).toBe(false)
  })

  it('finds appointment linked to assignment for today only', () => {
    const now = new Date('2026-08-11T12:00:00.000Z')
    const items = [
      baseAppointment({
        id: 'linked',
        sessionDate: '2026-08-11',
        assignmentId: 'assign-1',
      }),
      baseAppointment({
        id: 'solo-day',
        sessionDate: '2026-08-13',
        assignmentId: 'assign-2',
      }),
    ]

    expect(
      findAppointmentLinkedToAssignment(items, 'assign-1', now)?.id,
    ).toBe('linked')
    expect(
      findAppointmentLinkedToAssignment(items, 'assign-2', now),
    ).toBeNull()
  })
})
