import { describe, expect, it } from 'vitest'
import {
  ATHLETE_CALENDAR_EVENT_CATEGORY,
  athleteCalendarEventCategoryLabel,
  createAthleteCalendarEventDraft,
  normalizeAthleteCalendarEvent,
} from './athleteCalendarEvents'

describe('athleteCalendarEvents', () => {
  it('normalizes an owner-private calendar row for shared calendar rendering', () => {
    expect(
      normalizeAthleteCalendarEvent({
        id: 'event-1',
        athlete_id: 'athlete-1',
        title: 'Work',
        event_date: '2026-10-07',
        start_time: '10:00:00',
        duration_minutes: 240,
        category: 'work',
        status: 'scheduled',
      }),
    ).toMatchObject({
      id: 'event-1',
      athleteId: 'athlete-1',
      title: 'Work',
      sessionDate: '2026-10-07',
      startTime: '10:00',
      durationMinutes: 240,
      category: 'work',
      isAthletePrivateEvent: true,
      isPrivateEvent: true,
    })
  })

  it('creates a private event draft without coach visibility metadata', () => {
    expect(createAthleteCalendarEventDraft('2026-10-07')).toEqual({
      title: '',
      eventDate: '2026-10-07',
      startTime: '09:00',
      durationMinutes: '60',
      category: ATHLETE_CALENDAR_EVENT_CATEGORY.PERSONAL,
      locationName: '',
      notes: '',
    })
  })

  it('labels athlete-private categories', () => {
    expect(
      athleteCalendarEventCategoryLabel({
        category: ATHLETE_CALENDAR_EVENT_CATEGORY.SCHOOL,
      }),
    ).toBe('School')
  })
})
