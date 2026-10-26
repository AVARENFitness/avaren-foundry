import { describe, expect, it } from 'vitest'
import { validateRescheduleInput } from './calendarRescheduleValidation'

describe('calendar rescheduling input', () => {
  const base = { sessionDate: '2026-10-26', startTime: '09:30', durationMinutes: '45' }

  it('preserves an explicitly entered appointment duration', () => {
    expect(validateRescheduleInput(base)).toEqual({
      ok: true, sessionDate: '2026-10-26', startTime: '09:30', durationMinutes: 45,
    })
  })

  it.each(['', '0', '-10', 'abc', '15.5', 'Infinity'])(
    'rejects invalid duration %s instead of silently converting to 60',
    (durationMinutes) => {
      expect(validateRescheduleInput({ ...base, durationMinutes }).ok).toBe(false)
    },
  )

  it.each([
    { sessionDate: '2026-02-30' },
    { startTime: '26:00' },
    { sessionDate: '' },
    { startTime: '' },
  ])('rejects impossible or missing date/time %j', (change) => {
    expect(validateRescheduleInput({ ...base, ...change }).ok).toBe(false)
  })
})
