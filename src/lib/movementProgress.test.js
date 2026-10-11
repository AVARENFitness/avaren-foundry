import { describe, expect, it } from 'vitest'
import { movementProgressSummary } from './movementProgress'
import { preferRicherSession } from './athleteWorkoutHistory'
import { consistencyStreak } from './metrics'

describe('movement progress and history integrity', () => {
  it('counts cardio, mobility, distance and mixed sessions without double counting workouts', () => {
    const history = [
      { id: 'a', date: '2026-10-10', sets: [{ exercise: 'Squat', reps: 5 }], cardioEntries: [
        { kind: 'walk', durationMinutes: 30, distance: 2, distanceUnit: 'mi' },
        { kind: 'mobility', durationMinutes: 12, distance: null },
        { kind: 'yoga', durationMinutes: 18, distance: null },
      ] },
      { id: 'b', date: '2026-10-11', sets: [], cardioEntries: [
        { kind: 'run', durationMinutes: 25, distance: 4, distanceUnit: 'km' },
      ] },
      { id: 'c', date: '2026-10-11', sets: [{ exercise: 'Press', reps: 8 }] },
    ]
    expect(movementProgressSummary(history)).toEqual({
      sessionsWithMovement: 2,
      cardioMinutes: 55,
      mobilityMinutes: 30,
      miles: 2,
      kilometers: 4,
      activities: 4,
    })
  })

  it('ignores invalid numeric values instead of inventing time or distance', () => {
    expect(movementProgressSummary([{ cardioEntries: [
      { kind: 'walk', durationMinutes: 0, distance: 10, distanceUnit: 'mi' },
      { kind: 'mobility', durationMinutes: 'nope', distance: 1, distanceUnit: 'km' },
    ] }])).toMatchObject({ cardioMinutes: 0, mobilityMinutes: 0, miles: 0, kilometers: 0, activities: 0 })
  })

  it('prefers a richer mixed session when an older copy loses movement entries', () => {
    const full = { id: 'a', sets: [{ reps: 8 }], cardioEntries: [{ kind: 'walk', durationMinutes: 20 }] }
    const sparse = { id: 'a', sets: [{ reps: 8 }], cardioEntries: [] }
    expect(preferRicherSession(full, sparse)).toBe(full)
    expect(preferRicherSession(sparse, full)).toBe(full)
  })

  it('does not redefine streak logic when mobility is logged', () => {
    const history = [{ date: '2026-10-11', cardioEntries: [{ kind: 'yoga', durationMinutes: 20 }], sets: [] }]
    expect(consistencyStreak(history, new Date('2026-10-11T16:00:00'))).toBe(1)
  })
})
