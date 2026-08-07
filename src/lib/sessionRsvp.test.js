import { describe, expect, it } from 'vitest'
import { normalizeScheduledSession } from './coachScheduledSessions'
import {
  DEFAULT_RSVP_STATUS,
  RSVP_STATUS,
  athleteCanAccessSession,
  buildCoachRsvpAlert,
  isProtectedSessionFieldMutation,
  isRsvpException,
  normalizeRsvpStatus,
  rsvpCoachLabel,
  sortSessionsForCoachToday,
} from './sessionRsvp'

describe('sessionRsvp', () => {
  it('defaults existing sessions to awaiting_response', () => {
    const normalized = normalizeScheduledSession({
      id: 'sess-1',
      coach_id: 'coach-1',
      athlete_id: 'athlete-1',
      session_date: '2026-08-07',
      start_time: '14:00:00',
      status: 'scheduled',
    })

    expect(normalized.rsvpStatus).toBe(DEFAULT_RSVP_STATUS)
    expect(normalizeRsvpStatus(undefined)).toBe(DEFAULT_RSVP_STATUS)
  })

  it('labels coach RSVP states clearly', () => {
    expect(rsvpCoachLabel(RSVP_STATUS.CONFIRMED)).toBe('Confirmed')
    expect(rsvpCoachLabel(RSVP_STATUS.CANNOT_ATTEND)).toBe("Can't make it")
    expect(rsvpCoachLabel(RSVP_STATUS.AWAITING)).toBe('Awaiting reply')
  })

  it('allows athlete access only to own sessions', () => {
    const session = { athleteId: 'athlete-1' }
    expect(athleteCanAccessSession(session, 'athlete-1')).toBe(true)
    expect(athleteCanAccessSession(session, 'athlete-2')).toBe(false)
  })

  it('blocks protected session field mutations from athlete patches', () => {
    expect(isProtectedSessionFieldMutation({ status: 'completed' })).toBe(true)
    expect(isProtectedSessionFieldMutation({ startTime: '10:00' })).toBe(true)
    expect(isProtectedSessionFieldMutation({ rsvpStatus: 'confirmed' })).toBe(false)
  })

  it('prioritizes cannot-attend sessions for coach today', () => {
    const ordered = sortSessionsForCoachToday([
      {
        id: '1',
        sessionDate: '2026-08-07',
        startTime: '09:00',
        status: 'scheduled',
        rsvpStatus: RSVP_STATUS.CONFIRMED,
      },
      {
        id: '2',
        sessionDate: '2026-08-07',
        startTime: '14:00',
        status: 'scheduled',
        rsvpStatus: RSVP_STATUS.CANNOT_ATTEND,
      },
    ])

    expect(ordered[0].id).toBe('2')
    expect(isRsvpException(ordered[0])).toBe(true)
  })

  it('builds a coach alert for cannot-attend sessions', () => {
    const alert = buildCoachRsvpAlert(
      {
        startTime: '14:00',
        startsAt: '2026-08-07T18:00:00.000Z',
        scheduleTimezone: 'America/New_York',
        status: 'scheduled',
        rsvpStatus: RSVP_STATUS.CANNOT_ATTEND,
      },
      'Sarah',
    )

    expect(alert).toMatch(/Sarah can't make/)
  })
})
