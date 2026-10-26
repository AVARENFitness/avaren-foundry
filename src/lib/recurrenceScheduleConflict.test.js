import { describe, expect, it } from 'vitest'
import { hasFutureSeriesScheduleConflict } from './recurrenceScheduleConflict'

const recurring = (id, sessionDate, status = 'scheduled') => ({
  id, recurrenceSeriesId: 'series-a', sessionDate, startTime: '09:00',
  durationMinutes: 60, status,
})
const other = (id, sessionDate, startTime, status = 'scheduled') => ({
  id, sessionDate, startTime, durationMinutes: 60, status,
})

describe('recurring reschedule conflict guard', () => {
  it('detects another client booking on any affected future occurrence', () => {
    expect(hasFutureSeriesScheduleConflict({
      seriesId: 'series-a', effectiveDate: '2026-10-26',
      sessions: [recurring('a', '2026-10-26'), recurring('b', '2026-11-02'),
        other('other-client', '2026-11-02', '10:15')],
      startTime: '10:00', durationMinutes: 60,
    })).toBe(true)
  })

  it('ignores the own series and cancelled bookings', () => {
    expect(hasFutureSeriesScheduleConflict({
      seriesId: 'series-a', effectiveDate: '2026-10-26',
      sessions: [recurring('a', '2026-10-26'), recurring('b', '2026-11-02'),
        other('cancelled', '2026-11-02', '10:15', 'cancelled')],
      startTime: '10:00', durationMinutes: 60,
    })).toBe(false)
  })

  it('respects private calendar blocks and ignores past series occurrences', () => {
    expect(hasFutureSeriesScheduleConflict({
      seriesId: 'series-a', effectiveDate: '2026-11-02',
      sessions: [recurring('a', '2026-10-26'), recurring('b', '2026-11-02')],
      calendarItems: [other('private', '2026-11-02', '10:30')],
      startTime: '10:00', durationMinutes: 60,
    })).toBe(true)
  })
})
