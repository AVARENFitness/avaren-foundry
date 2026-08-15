import { describe, expect, it } from 'vitest'
import {
  localCalendarDateKey,
  sessionLocalCalendarDateKey,
} from './localCalendarDay'
import { findCompletedWorkoutToday } from './programWorkout'

describe('localCalendarDay', () => {
  it('uses local calendar identity instead of UTC date slices', () => {
    const localLateFriday = new Date('2026-08-14T23:30:00')
    const utcKey = localLateFriday.toISOString().slice(0, 10)
    const localKey = localCalendarDateKey(localLateFriday)

    expect(localKey).toBe('2026-08-14')
    expect(localKey).not.toBe(utcKey)
  })

  it('resolves session completion on the athlete local day', () => {
    const finishedAt = new Date('2026-08-14T22:00:00').toISOString()
    const session = { id: '1', name: 'Legs + Core', finishedAt }
    const saturday = new Date('2026-08-15T00:15:00')

    expect(sessionLocalCalendarDateKey(session)).toBe('2026-08-14')
    expect(findCompletedWorkoutToday([session], saturday)).toBeUndefined()
  })
})
