import { beforeEach, describe, expect, it } from 'vitest'
import {
  COACH_ACTIVE_MODE,
  clearLastActiveMode,
  readLastActiveMode,
  resolveDefaultActiveMode,
  shouldRestoreCoachMode,
  writeLastActiveMode,
} from './coachModePersistence'

describe('coachModePersistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('persists explicit coach and athlete mode switches', () => {
    writeLastActiveMode('coach-user', COACH_ACTIVE_MODE.COACH)
    expect(readLastActiveMode('coach-user')).toBe(COACH_ACTIVE_MODE.COACH)

    writeLastActiveMode('coach-user', COACH_ACTIVE_MODE.ATHLETE)
    expect(readLastActiveMode('coach-user')).toBe(COACH_ACTIVE_MODE.ATHLETE)
  })

  it('defaults the primary coach account to coach mode', () => {
    expect(
      resolveDefaultActiveMode({
        session: { user: { email: 'hello@avarenfitness.com', id: 'owner' } },
        coachAuthorized: false,
      }),
    ).toBe(COACH_ACTIVE_MODE.COACH)
  })

  it('defaults athlete-only accounts to athlete mode', () => {
    expect(
      resolveDefaultActiveMode({
        session: { user: { email: 'athlete@example.com', id: 'athlete' } },
        coachAuthorized: false,
      }),
    ).toBe(COACH_ACTIVE_MODE.ATHLETE)
  })

  it('restores coach mode for authorized coaches when persisted', () => {
    expect(
      shouldRestoreCoachMode({
        persistedMode: COACH_ACTIVE_MODE.COACH,
        coachAuthorized: true,
      }),
    ).toBe(true)
  })

  it('does not restore coach mode for athlete-only users', () => {
    expect(
      shouldRestoreCoachMode({
        persistedMode: COACH_ACTIVE_MODE.COACH,
        coachAuthorized: false,
      }),
    ).toBe(false)
  })

  it('preserves athlete workout resume over coach mode restore', () => {
    expect(
      shouldRestoreCoachMode({
        persistedMode: COACH_ACTIVE_MODE.COACH,
        coachAuthorized: true,
        hasActiveWorkout: true,
      }),
    ).toBe(false)
  })

  it('clears persisted mode on sign out helper', () => {
    writeLastActiveMode('coach-user', COACH_ACTIVE_MODE.COACH)
    clearLastActiveMode('coach-user')
    expect(readLastActiveMode('coach-user')).toBeNull()
  })
})
