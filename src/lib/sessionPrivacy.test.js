import { describe, expect, it } from 'vitest'
import { normalizeAthleteScheduledSession } from './coachScheduledSessions'
import {
  ATHLETE_SESSION_PRIVATE_FIELDS,
  RSVP_STATUS,
  athleteCanAccessSession,
  isAthleteSessionPayloadSafe,
  shouldNotifyCoachForRsvpChange,
} from './sessionRsvp'

describe('athlete session privacy', () => {
  const publicPayload = {
    id: 'sess-1',
    coach_display_name: 'Jacob',
    session_date: '2026-08-07',
    start_time: '16:00:00',
    starts_at: '2026-08-07T20:00:00.000Z',
    schedule_timezone: 'America/New_York',
    duration_minutes: 60,
    status: 'scheduled',
    rsvp_status: 'awaiting_response',
    rsvp_updated_at: null,
  }

  it('normalizes canonical appointment coach_id for follow-up identity', () => {
    const normalized = normalizeAthleteScheduledSession({
      ...publicPayload,
      coach_id: 'coach-1',
    })

    expect(normalized.coachId).toBe('coach-1')
  })

  it('allows coach_id in athlete-safe RPC payloads', () => {
    expect(
      isAthleteSessionPayloadSafe({
        ...publicPayload,
        coach_id: 'coach-1',
      }),
    ).toBe(true)
  })

  it('returns only allowlisted athlete session fields', () => {
    expect(isAthleteSessionPayloadSafe(publicPayload)).toBe(true)
    expect(publicPayload).not.toHaveProperty('coach_note')
    expect(publicPayload).not.toHaveProperty('session_history_id')
    expect(publicPayload).not.toHaveProperty('reminder_sent_at')

    const normalized = normalizeAthleteScheduledSession(publicPayload)
    expect(normalized).toMatchObject({
      id: 'sess-1',
      coachDisplayName: 'Jacob',
      startsAt: '2026-08-07T20:00:00.000Z',
      scheduleTimezone: 'America/New_York',
      rsvpStatus: RSVP_STATUS.AWAITING,
    })
    expect(normalized).not.toHaveProperty('coachNote')
  })

  it('rejects payloads containing private coach fields', () => {
    expect(
      isAthleteSessionPayloadSafe({
        ...publicPayload,
        coach_note: 'private note',
      }),
    ).toBe(false)

    for (const field of ATHLETE_SESSION_PRIVATE_FIELDS) {
      expect(
        isAthleteSessionPayloadSafe({
          ...publicPayload,
          [field]: 'secret',
        }),
      ).toBe(false)
    }
  })

  it('allows access only to the owning athlete', () => {
    const session = { athleteId: 'athlete-1' }
    expect(athleteCanAccessSession(session, 'athlete-1')).toBe(true)
    expect(athleteCanAccessSession(session, 'athlete-2')).toBe(false)
  })
})

describe('rsvp idempotency', () => {
  it('does not notify coach when RSVP is unchanged', () => {
    expect(
      shouldNotifyCoachForRsvpChange(
        RSVP_STATUS.CONFIRMED,
        RSVP_STATUS.CONFIRMED,
      ),
    ).toBe(false)
  })

  it('notifies coach exactly once when RSVP changes', () => {
    expect(
      shouldNotifyCoachForRsvpChange(
        RSVP_STATUS.AWAITING,
        RSVP_STATUS.CONFIRMED,
      ),
    ).toBe(true)
    expect(
      shouldNotifyCoachForRsvpChange(
        RSVP_STATUS.CONFIRMED,
        RSVP_STATUS.CANNOT_ATTEND,
      ),
    ).toBe(true)
  })
})
