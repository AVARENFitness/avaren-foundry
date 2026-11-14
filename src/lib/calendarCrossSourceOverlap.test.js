import { describe, expect, it } from 'vitest'
import { findOverlappingCalendarItem } from './calendarCrossSourceOverlap'

const personal = {
  id: 'personal',
  sessionDate: '2026-11-15',
  startTime: '10:00',
  durationMinutes: 60,
  status: 'scheduled',
  isAthletePrivateEvent: true,
}

describe('merged athlete and coach calendar overlap warnings', () => {
  it('detects a collision with coach-owned appointments even without a coach id', () => {
    const work = {
      id: 'coaching',
      sessionDate: personal.sessionDate,
      startTime: '10:30',
      durationMinutes: 60,
      status: 'scheduled',
      coachId: 'coach-1',
      isCoachWorkAppointment: true,
    }
    expect(findOverlappingCalendarItem(personal, [work])).toEqual(work)
  })

  it('detects personal/private overlaps regardless of calendar ownership', () => {
    expect(findOverlappingCalendarItem(personal, [
      { ...personal, id: 'coach-block', isAthletePrivateEvent: false, isCoachPrivateEvent: true },
    ])?.id).toBe('coach-block')
  })

  it('allows back-to-back events and separate days', () => {
    expect(findOverlappingCalendarItem(personal, [
      { ...personal, id: 'ends-at-start', startTime: '09:00', durationMinutes: 60 },
      { ...personal, id: 'next', startTime: '11:00' },
      { ...personal, id: 'tomorrow', sessionDate: '2026-11-16' },
    ])).toBeNull()
  })

  it('ignores cancelled, missed and completed bookings as conflicts', () => {
    const history = ['cancelled', 'missed', 'completed']
      .map((status) => ({ ...personal, id: status, status }))
    expect(findOverlappingCalendarItem(personal, history)).toBeNull()
  })

  it('excludes the event being edited without overlooking other appointments', () => {
    const conflict = { ...personal, id: 'other' }
    expect(findOverlappingCalendarItem(personal, [personal], { excludeId: 'personal' })).toBeNull()
    expect(findOverlappingCalendarItem(personal, [personal, conflict], { excludeId: 'personal' })).toEqual(conflict)
  })
})
