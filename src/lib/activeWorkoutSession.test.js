import { describe, expect, it } from 'vitest'
import {
  computeRestRemainingSeconds,
  getRestTimerRemainingSeconds,
  isRestTimerActive,
  isRestTimerVisible,
  shouldResumeActiveWorkoutScreen,
} from './activeWorkoutSession'

describe('activeWorkoutSession', () => {
  it('computes remaining rest time from absolute endsAt', () => {
    const now = Date.parse('2026-08-13T20:00:00.000Z')
    const endsAt = '2026-08-13T20:00:37.000Z'

    expect(computeRestRemainingSeconds(endsAt, now)).toBe(37)
  })

  it('marks expired rest timers complete', () => {
    const now = Date.parse('2026-08-13T20:01:00.000Z')
    const restTimer = { endsAt: '2026-08-13T20:00:30.000Z' }

    expect(isRestTimerActive(restTimer, now)).toBe(false)
    expect(computeRestRemainingSeconds(restTimer.endsAt, now)).toBe(0)
  })

  it('keeps paused rest timers visible with frozen remaining time', () => {
    const restTimer = {
      endsAt: '2026-08-13T20:01:00.000Z',
      paused: true,
      pausedRemaining: 42,
    }

    expect(isRestTimerActive(restTimer)).toBe(false)
    expect(isRestTimerVisible(restTimer)).toBe(true)
    expect(getRestTimerRemainingSeconds(restTimer)).toBe(42)
  })

  it('returns ~30 sec after 60 sec background on a 90 sec timer', () => {
    const startedAt = Date.parse('2026-08-13T20:00:00.000Z')
    const endsAt = new Date(startedAt + 90 * 1000).toISOString()
    const afterBackground = startedAt + 60 * 1000

    expect(
      computeRestRemainingSeconds(endsAt, afterBackground),
    ).toBe(30)
  })

  it('resumes gym when an active workout exists outside coach mode', () => {
    expect(
      shouldResumeActiveWorkoutScreen({
        activeWorkout: { id: 'session-1' },
        currentScreen: 'home',
      }),
    ).toBe(true)

    expect(
      shouldResumeActiveWorkoutScreen({
        activeWorkout: { id: 'session-1' },
        coachModeEnabled: true,
        currentScreen: 'home',
      }),
    ).toBe(false)

    expect(
      shouldResumeActiveWorkoutScreen({
        activeWorkout: { id: 'session-1' },
        currentScreen: 'gym',
      }),
    ).toBe(false)
  })
})
