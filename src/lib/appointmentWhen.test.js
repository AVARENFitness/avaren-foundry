import { describe, expect, it, vi } from 'vitest'
import {
  APPOINTMENT_DATE_UNAVAILABLE,
  extractAppointmentDateKey,
  formatAppointmentDayTime,
  formatAppointmentHomeWhen,
} from './appointmentWhen'

describe('appointmentWhen', () => {
  it('prefers canonical starts_at when session_date is an ISO timestamp', () => {
    expect(
      extractAppointmentDateKey({
        sessionDate: '2026-08-12T00:00:00.000Z',
        startsAt: '2026-08-12T13:00:00.000Z',
        scheduleTimezone: 'America/New_York',
      }),
    ).toBe('2026-08-12')
  })

  it('never renders literal Invalid Date for malformed session_date values', () => {
    const label = formatAppointmentHomeWhen(
      {
        sessionDate: '2026-08-12T00:00:00.000Z',
        startTime: '09:00',
        startsAt: '2026-08-12T13:00:00.000Z',
        scheduleTimezone: 'America/New_York',
      },
      new Date('2026-08-11T12:00:00.000Z'),
    )

    expect(label).not.toContain('Invalid Date')
    expect(label).toContain('9:00')
  })

  it('falls back quietly when date data is unusable', () => {
    expect(
      formatAppointmentHomeWhen({
        sessionDate: 'not-a-date',
        startTime: '09:00',
      }),
    ).toBe(`${APPOINTMENT_DATE_UNAVAILABLE} · 9:00 AM`)
  })

  it('formats day and time from starts_at when session_date is missing', () => {
    const label = formatAppointmentDayTime({
      startsAt: '2026-08-12T13:00:00.000Z',
      startTime: '09:00',
      scheduleTimezone: 'America/New_York',
    })

    expect(label).not.toContain('Invalid Date')
    expect(label).toContain('9:00')
  })

  it('logs DEV-safe diagnostics for invalid session dates', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    formatAppointmentHomeWhen({
      sessionDate: 'bad-value',
      startTime: '09:00',
    })

    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
