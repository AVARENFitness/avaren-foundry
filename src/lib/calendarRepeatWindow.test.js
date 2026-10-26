import { describe, expect, it } from 'vitest'
import { calendarRepeatWindow } from './calendarRepeatWindow'

describe('calendar repeat windows', () => {
  it('accepts valid client appointment and private-event windows', () => {
    expect(calendarRepeatWindow({
      sessionDate: '2026-10-26', startTime: '09:30', durationMinutes: 60,
    })).toEqual({ date: '2026-10-26', start: 570, end: 630 })
    expect(calendarRepeatWindow({
      eventDate: '2026-11-02', startTime: '14:00:00', durationMinutes: 90,
    })).toEqual({ date: '2026-11-02', start: 840, end: 930 })
  })

  it('rejects malformed dates, impossible dates and invalid times', () => {
    for (const [date, time] of [
      ['2026-02-30', '09:30'], ['2026-13-01', '09:30'],
      ['2026-10-26', '25:30'], ['2026-10-26', '09:65'],
      ['10/26/2026', '09:30'], ['', '09:30'],
    ]) {
      expect(calendarRepeatWindow({ sessionDate: date, startTime: time, durationMinutes: 60 })).toBeNull()
    }
  })

  it('rejects non-positive or missing durations rather than allowing unchecked overlaps', () => {
    expect(calendarRepeatWindow({ sessionDate: '2026-10-26', startTime: '09:30', durationMinutes: 0 })).toBeNull()
    expect(calendarRepeatWindow({ sessionDate: '2026-10-26', startTime: '09:30', durationMinutes: undefined })).toBeNull()
  })
})
