import { beforeEach, describe, expect, it, vi } from 'vitest'
import { coachBackend } from '../../lib/coachBackend'
import { athleteCalendarBackend } from '../../lib/athleteCalendarEvents'
import {
  executeCoachAvailabilityQuery,
  findAvailabilityForDay,
  parseCoachAvailabilityQuery,
} from './avaCoachAvailability'

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    listScheduledSessions: vi.fn(),
    listCoachCalendarEvents: vi.fn(),
  },
}))

vi.mock('../../lib/athleteCalendarEvents', async () => {
  const actual = await vi.importActual('../../lib/athleteCalendarEvents')
  return {
    ...actual,
    athleteCalendarBackend: {
      list: vi.fn(),
    },
  }
})

const now = new Date('2026-10-05T09:00:00-04:00')

describe('AVA coach availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listScheduledSessions.mockResolvedValue([])
    coachBackend.listCoachCalendarEvents.mockResolvedValue([])
    athleteCalendarBackend.list.mockResolvedValue([])
  })

  it('parses a free-day question', () => {
    expect(parseCoachAvailabilityQuery('When am I free Wednesday?', { now })).toMatchObject({
      kind: 'availability',
      rangeKind: 'day',
      startDate: '2026-10-07',
      endDate: '2026-10-07',
      durationMinutes: null,
    })
  })

  it('parses a weekly openings question', () => {
    expect(
      parseCoachAvailabilityQuery('What openings do I have this week?', { now }),
    ).toMatchObject({
      kind: 'availability',
      rangeKind: 'week',
      startDate: '2026-10-05',
      endDate: '2026-10-11',
    })
  })

  it('parses hyphenated duration and after-time constraints', () => {
    expect(
      parseCoachAvailabilityQuery(
        'Do I have a 60-minute opening after 3 PM Thursday?',
        { now },
      ),
    ).toMatchObject({
      rangeKind: 'day',
      startDate: '2026-10-08',
      durationMinutes: 60,
      afterMinutes: 15 * 60,
    })
  })

  it('parses a client-specific slot search without implying access to client private time', () => {
    expect(
      parseCoachAvailabilityQuery(
        'Find me a 45-minute slot for Jake this week.',
        { now },
      ),
    ).toMatchObject({
      rangeKind: 'week',
      startDate: '2026-10-05',
      endDate: '2026-10-11',
      durationMinutes: 45,
      clientQuery: 'Jake',
    })
  })

  it('finds gaps around merged busy time', () => {
    const slots = findAvailabilityForDay({
      dayKey: '2026-10-07',
      now,
      items: [
        {
          sessionDate: '2026-10-07',
          startTime: '10:00',
          durationMinutes: 60,
          status: 'scheduled',
        },
        {
          sessionDate: '2026-10-07',
          startTime: '12:00',
          durationMinutes: 60,
          status: 'scheduled',
          isCoachPrivateEvent: true,
        },
        {
          sessionDate: '2026-10-07',
          startTime: '16:00',
          durationMinutes: 60,
          status: 'scheduled',
          isAthletePrivateEvent: true,
        },
      ],
    })

    expect(slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ startTime: '06:00', endTime: '10:00' }),
        expect.objectContaining({ startTime: '11:00', endTime: '12:00' }),
        expect.objectContaining({ startTime: '13:00', endTime: '16:00' }),
        expect.objectContaining({ startTime: '17:00', endTime: '21:00' }),
      ]),
    )
  })

  it('answers from client appointments plus both private calendars', async () => {
    coachBackend.listScheduledSessions.mockResolvedValue([
      {
        id: 'client-1',
        session_date: '2026-10-07',
        start_time: '10:00',
        duration_minutes: 60,
        status: 'scheduled',
      },
    ])
    coachBackend.listCoachCalendarEvents.mockResolvedValue([
      {
        id: 'coach-private',
        event_date: '2026-10-07',
        start_time: '12:00',
        duration_minutes: 60,
        status: 'scheduled',
      },
    ])
    athleteCalendarBackend.list.mockResolvedValue([
      {
        id: 'athlete-private',
        event_date: '2026-10-07',
        start_time: '16:00',
        duration_minutes: 60,
        status: 'scheduled',
      },
    ])

    const query = parseCoachAvailabilityQuery('When am I free Wednesday?', {
      now,
    })
    const result = await executeCoachAvailabilityQuery(query, { now })

    expect(coachBackend.listScheduledSessions).toHaveBeenCalledWith({
      startDate: '2026-10-07',
      endDate: '2026-10-07',
    })
    expect(coachBackend.listCoachCalendarEvents).toHaveBeenCalledWith({
      startDate: '2026-10-07',
      endDate: '2026-10-07',
    })
    expect(athleteCalendarBackend.list).toHaveBeenCalledWith({
      startDate: '2026-10-07',
      endDate: '2026-10-07',
    })
    expect(result.message).toMatch(/6:00 AM–10:00 AM/)
    expect(result.message).toMatch(/5:00 PM–9:00 PM/)
  })

  it('resolves a client name only to label the coach opening search', async () => {
    const query = parseCoachAvailabilityQuery(
      'Find me a 45-minute slot for Jake this week.',
      { now },
    )

    const result = await executeCoachAvailabilityQuery(query, {
      now,
      clients: [
        {
          id: 'business-jake',
          business_client_id: 'business-jake',
          coach_label: 'Jake',
        },
      ],
    })

    expect(result.kind).toBe('availability')
    expect(result.message).toMatch(/45-minute openings for Jake/i)
    expect(result.message).toMatch(/merged AVAREN calendar/i)
  })
})
