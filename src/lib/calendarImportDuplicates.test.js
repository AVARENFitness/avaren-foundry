import { describe, expect, it } from 'vitest'
import { classifyCalendarImportEntry } from './calendarImportDuplicates'

const clients = [{ id: 'client-connie', coach_label: 'Connie Turner' }, { id: 'client-other', coach_label: 'Other Client' }]
const imported = { title: 'Connie Turner', date: '2026-10-19', startTime: '08:00', durationMinutes: 60,
  suggestedType: 'training_candidate', businessClientId: 'client-connie' }

describe('calendar screenshot import duplicate classification', () => {
  it('recognizes an existing training appointment by canonical business-client ID and time', () => {
    expect(classifyCalendarImportEntry(imported, [{ businessClientId: 'client-connie',
      sessionDate: '2026-10-19', startTime: '08:00', durationMinutes: 60, status: 'scheduled' }], clients).kind).toBe('duplicate')
  })
  it('flags another client at the same time as a conflict, never a duplicate', () => {
    expect(classifyCalendarImportEntry(imported, [{ businessClientId: 'client-other',
      sessionDate: '2026-10-19', startTime: '08:00', durationMinutes: 60, status: 'scheduled' }], clients).kind).toBe('conflict')
  })
  it('flags partial overlaps and different durations', () => {
    expect(classifyCalendarImportEntry(imported, [{ businessClientId: 'client-connie',
      sessionDate: '2026-10-19', startTime: '08:30', durationMinutes: 60 }], clients).kind).toBe('conflict')
  })
  it('ignores cancelled items and other dates', () => {
    expect(classifyCalendarImportEntry(imported, [{ businessClientId: 'client-connie',
      sessionDate: '2026-10-19', startTime: '08:00', durationMinutes: 60, status: 'cancelled' },
      { businessClientId: 'client-connie', sessionDate: '2026-10-21', startTime: '08:00', durationMinutes: 60 }], clients).kind).toBe('new')
  })
  it('recognizes identical ordinary events without matching them to training clients', () => {
    const event = { title: 'Next level', date: '2026-10-19', startTime: '09:30', durationMinutes: 150, suggestedType: 'private' }
    expect(classifyCalendarImportEntry(event, [{ title: 'Next level', isCoachPrivateEvent: true,
      eventDate: event.date, startTime: event.startTime, durationMinutes: 150 }], clients).kind).toBe('duplicate')
  })
})
