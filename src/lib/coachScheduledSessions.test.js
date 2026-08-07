import { describe, expect, it } from 'vitest'
import {
  cancelScheduledSession,
  completeScheduledSession,
  mapCompleteScheduledSessionRpcError,
  normalizeCompleteScheduledSessionRpcResult,
  normalizeUndoScheduledSessionRpcResult,
  normalizeScheduledSession,
  SCHEDULED_SESSION_STATUS,
  undoScheduledSessionCompletion,
} from './coachScheduledSessions'

const basePackage = {
  id: 'pkg-1',
  totalSessions: 10,
  sessionsRemaining: 4,
  sessionsUsed: 6,
  purchasedAt: '2026-08-01',
  expiresAt: null,
}

const scheduledSession = {
  id: 'sess-1',
  coachId: 'coach-1',
  athleteId: 'athlete-1',
  sessionDate: '2026-08-07',
  startTime: '09:00',
  durationMinutes: 60,
  coachNote: 'Lower body',
  status: SCHEDULED_SESSION_STATUS.SCHEDULED,
  completedAt: null,
  sessionHistoryId: null,
}

describe('coachScheduledSessions', () => {
  it('normalizes database rows for the calendar', () => {
    const normalized = normalizeScheduledSession({
      id: 'sess-1',
      coach_id: 'coach-1',
      athlete_id: 'athlete-1',
      session_date: '2026-08-07',
      start_time: '09:00:00',
      duration_minutes: 60,
      coach_note: 'Focus squats',
      status: 'scheduled',
    })

    expect(normalized).toMatchObject({
      sessionDate: '2026-08-07',
      startTime: '09:00',
      coachNote: 'Focus squats',
      status: 'scheduled',
    })
  })

  it('completes a scheduled session and decrements the package once', () => {
    const result = completeScheduledSession({
      session: scheduledSession,
      pkg: basePackage,
      coachLabel: 'coach@avaren.com',
      now: new Date('2026-08-07T10:00:00'),
    })

    expect(result.ok).toBe(true)
    expect(result.package.sessionsRemaining).toBe(3)
    expect(result.package.sessionsUsed).toBe(7)
    expect(result.session.status).toBe(SCHEDULED_SESSION_STATUS.COMPLETED)
  })

  it('blocks duplicate completion', () => {
    const completed = {
      ...scheduledSession,
      status: SCHEDULED_SESSION_STATUS.COMPLETED,
      completedAt: '2026-08-07T10:00:00',
      sessionHistoryId: 'hist-1',
    }

    const result = completeScheduledSession({
      session: completed,
      pkg: basePackage,
      coachLabel: 'coach@avaren.com',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('already_completed')
  })

  it('restores package balance on undo', () => {
    const completed = completeScheduledSession({
      session: scheduledSession,
      pkg: basePackage,
      coachLabel: 'coach@avaren.com',
      now: new Date('2026-08-07T10:00:00'),
    })

    const undone = undoScheduledSessionCompletion({
      session: completed.session,
      pkg: completed.package,
      history: [completed.historyEntry],
      undoSnapshot: completed.undoSnapshot,
    })

    expect(undone.ok).toBe(true)
    expect(undone.package.sessionsRemaining).toBe(4)
    expect(undone.package.sessionsUsed).toBe(6)
    expect(undone.session.status).toBe(SCHEDULED_SESSION_STATUS.SCHEDULED)
  })

  it('cancels without changing package balance', () => {
    const before = { ...basePackage }
    const result = cancelScheduledSession(scheduledSession)

    expect(result.ok).toBe(true)
    expect(result.session.status).toBe(SCHEDULED_SESSION_STATUS.CANCELLED)
    expect(before.sessionsRemaining).toBe(basePackage.sessionsRemaining)
    expect(before.sessionsUsed).toBe(basePackage.sessionsUsed)
  })

  it('blocks completion when no sessions remain', () => {
    const depleted = {
      ...basePackage,
      sessionsRemaining: 0,
      sessionsUsed: 10,
    }

    const result = completeScheduledSession({
      session: scheduledSession,
      pkg: depleted,
      coachLabel: 'coach@avaren.com',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('no_sessions_remaining')
  })

  it('maps duplicate completion RPC errors', () => {
    const mapped = mapCompleteScheduledSessionRpcError({
      message: 'already_completed',
    })

    expect(mapped.ok).toBe(false)
    expect(mapped.error).toBe('already_completed')
  })

  it('maps zero-balance RPC errors', () => {
    const mapped = mapCompleteScheduledSessionRpcError({
      message: 'no_sessions_remaining',
    })

    expect(mapped.ok).toBe(false)
    expect(mapped.error).toBe('no_sessions_remaining')
  })

  it('normalizes atomic completion RPC payloads', () => {
    const normalized = normalizeCompleteScheduledSessionRpcResult({
      ok: true,
      session: {
        id: 'sess-1',
        coach_id: 'coach-1',
        athlete_id: 'athlete-1',
        session_date: '2026-08-07',
        start_time: '09:00:00',
        status: 'completed',
        session_history_id: 'hist-1',
      },
      package: {
        id: 'pkg-1',
        total_sessions: 10,
        sessions_remaining: 3,
        sessions_used: 7,
      },
      history: {
        id: 'hist-1',
        package_id: 'pkg-1',
        session_date: '2026-08-07',
      },
    })

    expect(normalized.ok).toBe(true)
    expect(normalized.session.status).toBe('completed')
    expect(normalized.package.sessions_remaining).toBe(3)
    expect(normalized.history.id).toBe('hist-1')
  })

  it('rejects empty atomic completion payloads', () => {
    expect(normalizeCompleteScheduledSessionRpcResult(null).error).toBe(
      'empty_response',
    )
    expect(normalizeCompleteScheduledSessionRpcResult({ ok: true }).error).toBe(
      'empty_response',
    )
  })

  it('normalizes atomic undo RPC payloads', () => {
    const normalized = normalizeUndoScheduledSessionRpcResult({
      ok: true,
      session: {
        id: 'sess-1',
        status: 'scheduled',
        session_history_id: null,
      },
      package: {
        id: 'pkg-1',
        sessions_remaining: 4,
        sessions_used: 6,
      },
    })

    expect(normalized.ok).toBe(true)
    expect(normalized.session.status).toBe('scheduled')
    expect(normalized.package.sessions_remaining).toBe(4)
  })

  it('blocks a second local completion attempt after the first succeeds', () => {
    const first = completeScheduledSession({
      session: scheduledSession,
      pkg: basePackage,
      coachLabel: 'coach@avaren.com',
    })

    expect(first.ok).toBe(true)

    const second = completeScheduledSession({
      session: first.session,
      pkg: first.package,
      coachLabel: 'coach@avaren.com',
    })

    expect(second.ok).toBe(false)
    expect(second.error).toBe('already_completed')
  })

  it('cannot-attend RSVP does not deduct package sessions', () => {
    const sessionWithRsvp = {
      ...scheduledSession,
      rsvpStatus: 'cannot_attend',
    }

    expect(sessionWithRsvp.status).toBe('scheduled')
    expect(basePackage.sessionsRemaining).toBe(4)

    const cancelled = cancelScheduledSession(sessionWithRsvp)
    expect(cancelled.ok).toBe(true)
    expect(cancelled.session.status).toBe(SCHEDULED_SESSION_STATUS.CANCELLED)
    expect(basePackage.sessionsRemaining).toBe(4)
  })
})
