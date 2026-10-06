import { describe, expect, it } from 'vitest'
import {
  consistencyStreak,
  longestConsistencyStreak,
} from './metrics'
import { weeklyVolume } from './analytics'

const session = (date, weight = 100, reps = 10) => ({
  id: date,
  date,
  finishedAt: `${date}T12:00:00`,
  sets: [{ exercise: 'Bench Press', weight, reps, done: true }],
})

describe('Progress training metrics', () => {
  it('keeps a training streak through normal one-day rest gaps', () => {
    const history = [
      session('2026-10-02'),
      session('2026-10-04'),
      session('2026-10-06'),
    ]

    expect(consistencyStreak(history, new Date('2026-10-06T18:00:00'))).toBe(3)
    expect(longestConsistencyStreak(history)).toBe(3)
  })

  it('resets current streak after more than two days away', () => {
    expect(
      consistencyStreak(
        [session('2026-10-01')],
        new Date('2026-10-06T18:00:00'),
      ),
    ).toBe(0)
  })

  it('counts this-week volume from local calendar dates', () => {
    const history = [
      session('2026-10-05', 100, 10),
      session('2026-10-06', 120, 10),
      session('2026-10-02', 500, 10),
    ]

    expect(
      weeklyVolume(history, new Date('2026-10-06T18:00:00')),
    ).toBe(2200)
  })
})
