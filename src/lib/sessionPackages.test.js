import { describe, expect, it } from 'vitest'
import {
  addSessionsToPackage,
  canRecordSession,
  emptySessionPackage,
  packageIsComplete,
  recordSessionOnPackage,
  undoSessionRecord,
} from './sessionPackages'

const basePackage = {
  id: 'pkg-1',
  totalSessions: 10,
  sessionsRemaining: 4,
  sessionsUsed: 6,
  purchasedAt: '2026-08-01',
  expiresAt: null,
}

describe('sessionPackages', () => {
  it('records a session and updates counts', () => {
    const result = recordSessionOnPackage(basePackage, {
      coachLabel: 'coach@avaren.com',
      note: 'Lower body focus',
      sessionDate: '2026-08-05',
      now: new Date('2026-08-05T14:00:00'),
    })

    expect(result.ok).toBe(true)
    expect(result.package.sessionsRemaining).toBe(3)
    expect(result.package.sessionsUsed).toBe(7)
    expect(result.historyEntry.sessionDate).toBe('2026-08-05')
    expect(result.historyEntry.coachLabel).toBe('coach@avaren.com')
    expect(result.historyEntry.note).toBe('Lower body focus')
  })

  it('supports undo within the recorded snapshot', () => {
    const recorded = recordSessionOnPackage(basePackage, {
      coachLabel: 'coach@avaren.com',
      now: new Date('2026-08-05T14:00:00'),
    })

    const history = [recorded.historyEntry]
    const undone = undoSessionRecord(
      recorded.package,
      history,
      recorded.undoSnapshot,
    )

    expect(undone.ok).toBe(true)
    expect(undone.package.sessionsRemaining).toBe(4)
    expect(undone.package.sessionsUsed).toBe(6)
    expect(undone.history).toHaveLength(0)
  })

  it('blocks recording when no sessions remain', () => {
    const depleted = {
      ...basePackage,
      sessionsRemaining: 0,
      sessionsUsed: 10,
    }

    expect(canRecordSession(depleted)).toBe(false)
    expect(packageIsComplete(depleted)).toBe(true)

    const result = recordSessionOnPackage(depleted)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('no_sessions_remaining')
  })

  it('adds preset and custom session counts', () => {
    const first = addSessionsToPackage(emptySessionPackage(), 5, {
      now: new Date('2026-08-05T10:00:00'),
    })

    expect(first.ok).toBe(true)
    expect(first.package.totalSessions).toBe(5)
    expect(first.package.sessionsRemaining).toBe(5)
    expect(first.package.purchasedAt).toBe('2026-08-05')

    const second = addSessionsToPackage(first.package, 10)
    expect(second.package.totalSessions).toBe(15)
    expect(second.package.sessionsRemaining).toBe(15)
    expect(second.package.purchasedAt).toBe('2026-08-05')
  })

  it('keeps session history entries separate from workout logs', () => {
    const recorded = recordSessionOnPackage(basePackage, {
      coachLabel: 'Coach Ava',
      note: 'In-person session',
    })

    expect(recorded.historyEntry).toMatchObject({
      coachLabel: 'Coach Ava',
      note: 'In-person session',
    })
    expect(recorded.historyEntry).not.toHaveProperty('workout_payload')
    expect(recorded.historyEntry).not.toHaveProperty('sets')
  })
})
