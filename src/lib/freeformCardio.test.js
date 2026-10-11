import { describe, expect, it } from 'vitest'
import { CARDIO_ACTIVITIES, hasLoggedWorkoutActivity, normalizeCardioEntry } from './freeformCardio'
import { createFreeformActiveWorkout } from './freeformWorkout'
import { advanceProgramNextWorkout } from './programWorkout'

describe('freeform cardio logging', () => {
  it('supports walk, bike, run, elliptical, and other activity', () => {
    expect(CARDIO_ACTIVITIES.map((item) => item.value)).toEqual(
      expect.arrayContaining(['walk', 'bike', 'run', 'elliptical', 'other']),
    )
  })

  it('records duration and an optional measured distance without inventing metrics', () => {
    const walk = normalizeCardioEntry({ kind: 'walk', minutes: '35', distance: '2.1', unit: 'mi' })
    expect(walk).toMatchObject({ kind: 'walk', durationMinutes: 35, distance: 2.1, distanceUnit: 'mi' })
    const stretch = normalizeCardioEntry({ kind: 'other', minutes: '15' })
    expect(stretch).toMatchObject({ durationMinutes: 15, distance: null })
    expect(hasLoggedWorkoutActivity([], [walk])).toBe(true)
    expect(hasLoggedWorkoutActivity([], [])).toBe(false)
  })

  it('rejects invalid durations, distance, activity, and measurement units', () => {
    expect(normalizeCardioEntry({ minutes: '0' })).toBeNull()
    expect(normalizeCardioEntry({ minutes: 'NaN' })).toBeNull()
    expect(normalizeCardioEntry({ minutes: '25', distance: '-1' })).toBeNull()
    expect(normalizeCardioEntry({ minutes: '25', unit: 'feet' })).toBeNull()
    expect(normalizeCardioEntry({ kind: 'unknown', minutes: '25' })).toBeNull()
  })

  it('keeps freeform origin separate from planned workout rotation', () => {
    const session = createFreeformActiveWorkout({ id: 'recovery-day' })
    expect(session.assignmentId).toBeNull()
    expect(session.origin).toBe('freeform')
    // Advance only the programmed workout if it actually completes.
    expect(advanceProgramNextWorkout({
      rotation: ['Chest + Back', 'Arms'],
      completedWorkoutName: 'Chest + Back',
      currentNextWorkout: 'Chest + Back',
    })).toBe('Arms')
  })
})
