import { describe, expect, it } from 'vitest'
import { weeklyMovementTrends } from './movementTrends'

describe('weekly movement trends', () => {
  it('splits cardio and mobility into six Monday-start weeks without counting strength-only sessions', () => {
    const weeks = weeklyMovementTrends([
      { date: '2026-10-05', cardioEntries: [{ kind: 'walk', durationMinutes: 30 }, { kind: 'yoga', durationMinutes: 20 }], sets: [{ exercise: 'Squat' }] },
      { date: '2026-10-11', cardioEntries: [{ kind: 'pilates', durationMinutes: 15 }, { kind: 'other', durationMinutes: 10 }] },
      { date: '2026-10-04', cardioEntries: [{ kind: 'run', durationMinutes: 25 }] },
      { date: '2026-10-11', sets: [{ exercise: 'Bench' }] },
    ], new Date('2026-10-11T12:00:00'))
    expect(weeks).toHaveLength(6)
    expect(weeks.at(-1)).toMatchObject({ key: '2026-10-05', cardioMinutes: 40, mobilityMinutes: 35, sessions: 2 })
    expect(weeks.at(-2)).toMatchObject({ key: '2026-09-28', cardioMinutes: 25, mobilityMinutes: 0, sessions: 1 })
  })

  it('excludes future dates and invalid durations without inventing activity', () => {
    const weeks = weeklyMovementTrends([
      { date: '2026-10-12', cardioEntries: [{ kind: 'walk', durationMinutes: 200 }] },
      { date: '2026-10-10', cardioEntries: [{ kind: 'mobility', durationMinutes: 'not valid' }] },
    ], new Date('2026-10-11T12:00:00'))
    expect(weeks.reduce((total, week) => total + week.cardioMinutes + week.mobilityMinutes + week.sessions, 0)).toBe(0)
  })
})
