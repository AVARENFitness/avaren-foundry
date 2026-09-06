import { describe, expect, it } from 'vitest'
import {
  OPEN_WORKOUT_KEY,
  OPEN_WORKOUT_NAME,
  WORKOUT_ORIGIN,
  createFreeformActiveWorkout,
  isFreeformWorkoutSession,
} from './freeformWorkout'

describe('freeformWorkout', () => {
  it('creates a blank Open Workout session with freeform origin', () => {
    const session = createFreeformActiveWorkout({
      id: 'free-1',
      startedAt: new Date('2026-08-07T14:00:00.000Z'),
    })

    expect(session.id).toBe('free-1')
    expect(session.name).toBe(OPEN_WORKOUT_NAME)
    expect(session.workoutKey).toBe(OPEN_WORKOUT_KEY)
    expect(session.origin).toBe(WORKOUT_ORIGIN.FREEFORM)
    expect(session.exercises).toEqual([])
    expect(session.assignmentId).toBeNull()
    expect(isFreeformWorkoutSession(session)).toBe(true)
  })

  it('does not treat programmed sessions as freeform by name alone', () => {
    expect(
      isFreeformWorkoutSession({
        name: OPEN_WORKOUT_NAME,
        origin: null,
      }),
    ).toBe(false)
  })
})
