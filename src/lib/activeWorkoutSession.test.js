import { describe, expect, it } from 'vitest'
import {
  computeRestRemainingSeconds,
  getRestTimerRemainingSeconds,
  insertExerciseAfterIndex,
  isRestTimerActive,
  isRestTimerVisible,
  resolveQuickAddAfterIndex,
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

  describe('quick-add insertion order', () => {
    const exercises = [
      { id: '1', name: 'Bench Press' },
      { id: '2', name: 'Incline Press' },
      { id: '3', name: 'Cable Fly' },
      { id: '4', name: 'Triceps Pushdown' },
      { id: '5', name: 'Lateral Raise' },
    ]

    it('add after exercise 1 => new exercise becomes 2', () => {
      const afterIndex = resolveQuickAddAfterIndex({
        exercises,
        activeExerciseIndex: 0,
      })
      const next = insertExerciseAfterIndex(
        exercises,
        { id: 'new', name: 'Pec Deck' },
        afterIndex,
      )

      expect(afterIndex).toBe(0)
      expect(next.map((item) => item.name)).toEqual([
        'Bench Press',
        'Pec Deck',
        'Incline Press',
        'Cable Fly',
        'Triceps Pushdown',
        'Lateral Raise',
      ])
    })

    it('add after exercise 3 => new exercise becomes 4 and later exercises shift', () => {
      const afterIndex = resolveQuickAddAfterIndex({
        exercises,
        activeExerciseIndex: 2,
      })
      const next = insertExerciseAfterIndex(
        exercises,
        { id: 'new', name: 'Pec Deck' },
        afterIndex,
      )

      expect(afterIndex).toBe(2)
      expect(next.map((item) => item.name)).toEqual([
        'Bench Press',
        'Incline Press',
        'Cable Fly',
        'Pec Deck',
        'Triceps Pushdown',
        'Lateral Raise',
      ])
      expect(next[4].id).toBe('4')
      expect(next[5].id).toBe('5')
    })

    it('add after final exercise becomes final+1', () => {
      const afterIndex = resolveQuickAddAfterIndex({
        exercises,
        activeExerciseIndex: 4,
      })
      const next = insertExerciseAfterIndex(
        exercises,
        { id: 'new', name: 'Pec Deck' },
        afterIndex,
      )

      expect(next.at(-1).name).toBe('Pec Deck')
      expect(next).toHaveLength(6)
    })

    it('fallback with no valid current context appends safely', () => {
      expect(
        resolveQuickAddAfterIndex({
          exercises,
          activeExerciseIndex: null,
        }),
      ).toBeNull()
      expect(
        resolveQuickAddAfterIndex({
          exercises: [],
          activeExerciseIndex: 0,
        }),
      ).toBeNull()

      const next = insertExerciseAfterIndex(
        exercises,
        { id: 'new', name: 'Pec Deck' },
        null,
      )
      expect(next.at(-1).name).toBe('Pec Deck')
    })

    it('keeps completed set state attached to the correct exercises', () => {
      const withSets = exercises.map((exercise, index) => ({
        ...exercise,
        sets: [{ number: 1, done: index === 0, weight: 100 + index, reps: 8 }],
      }))
      const next = insertExerciseAfterIndex(
        withSets,
        { id: 'new', name: 'Pec Deck', sets: [{ number: 1, done: false }] },
        2,
      )

      expect(next[0].sets[0]).toMatchObject({ done: true, weight: 100 })
      expect(next[2].sets[0]).toMatchObject({ done: false, weight: 102 })
      expect(next[3].name).toBe('Pec Deck')
      expect(next[4].sets[0]).toMatchObject({ weight: 103 })
    })
  })
})
