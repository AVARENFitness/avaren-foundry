import { describe, expect, it } from 'vitest'
import {
  COACH_CALENDAR_VIEW,
  appointmentsForCoachDayAgenda,
  buildCoachWeekAgendaDays,
  countActiveAppointmentsByDay,
  formatCoachCalendarDayHeading,
  identifyNextCoachAppointment,
  isPastCoachAppointment,
} from './coachCalendarUi'
import { APPOINTMENT_STATUS } from './coachingAppointment'

const session = (overrides = {}) => ({
  id: 's1',
  sessionDate: '2026-08-15',
  startTime: '09:00',
  durationMinutes: 60,
  status: APPOINTMENT_STATUS.SCHEDULED,
  ...overrides,
})

describe('coachCalendarUi', () => {
  it('defaults to today view constant', () => {
    expect(COACH_CALENDAR_VIEW.TODAY).toBe('today')
  })

  it('sorts day agenda chronologically', () => {
    const items = appointmentsForCoachDayAgenda(
      [
        session({ id: 'late', startTime: '14:00' }),
        session({ id: 'early', startTime: '09:00' }),
      ],
      '2026-08-15',
    )

    expect(items.map((item) => item.id)).toEqual(['early', 'late'])
  })

  it('identifies next upcoming appointment on a day', () => {
    const now = new Date('2026-08-15T10:00:00')
    const next = identifyNextCoachAppointment(
      [
        session({ id: 'past', startTime: '08:00' }),
        session({ id: 'next', startTime: '11:00' }),
        session({ id: 'later', startTime: '15:00' }),
      ],
      { now, dayKey: '2026-08-15' },
    )

    expect(next?.id).toBe('next')
  })

  it('marks past appointments by end time', () => {
    const now = new Date('2026-08-15T10:30:00')
    expect(isPastCoachAppointment(session({ startTime: '09:00' }), now)).toBe(true)
    expect(isPastCoachAppointment(session({ startTime: '11:00' }), now)).toBe(false)
  })

  it('counts active appointments per day', () => {
    const counts = countActiveAppointmentsByDay(
      [
        session({ sessionDate: '2026-08-15' }),
        session({ id: 's2', sessionDate: '2026-08-15' }),
        session({ id: 's3', sessionDate: '2026-08-16' }),
        session({
          id: 's4',
          sessionDate: '2026-08-16',
          status: APPOINTMENT_STATUS.CANCELLED,
        }),
      ],
      ['2026-08-15', '2026-08-16', '2026-08-17'],
    )

    expect(counts).toEqual({
      '2026-08-15': 2,
      '2026-08-16': 1,
      '2026-08-17': 0,
    })
  })

  it('builds seven-day week agenda summaries', () => {
    const days = buildCoachWeekAgendaDays(
      [session(), session({ id: 'cancelled', status: APPOINTMENT_STATUS.CANCELLED })],
      ['2026-08-15', '2026-08-16'],
    )

    expect(days).toHaveLength(2)
    expect(days[0].activeCount).toBe(1)
    expect(days[0].items).toHaveLength(2)
  })

  it('formats day headings for agenda headers', () => {
    expect(formatCoachCalendarDayHeading('2026-08-15')).toMatch(/Aug 15/)
  })
})
