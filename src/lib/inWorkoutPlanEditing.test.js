import { describe, expect, it } from 'vitest'
import {
  addExerciseToWorkoutPlan,
  buildPlanExerciseFromQuickAdd,
  canEditActiveWorkoutPlan,
  removeExerciseFromWorkoutPlan,
} from './inWorkoutPlanEditing'

const program = {
  rotation: ['Arms'],
  nextWorkout: 'Arms',
  workouts: {
    Arms: [
      { name: 'Curl', sets: 3, muscle: 'Biceps' },
      { name: 'Pushdown', sets: 3, muscle: 'Triceps' },
    ],
  },
}

describe('inWorkoutPlanEditing', () => {
  it('allows persistent editing only for the athlete own named workout', () => {
    expect(
      canEditActiveWorkoutPlan({
        program,
        activeWorkout: { name: 'Arms', exercises: [] },
      }),
    ).toBe(true)

    expect(
      canEditActiveWorkoutPlan({
        program,
        activeWorkout: {
          name: 'Arms',
          assignmentId: 'assignment-1',
          exercises: [],
        },
      }),
    ).toBe(false)

    expect(
      canEditActiveWorkoutPlan({
        program,
        activeWorkout: {
          name: 'Open Workout',
          origin: 'freeform',
          exercises: [],
        },
      }),
    ).toBe(false)
  })

  it('inserts a newly saved exercise after the current planned exercise', () => {
    const next = addExerciseToWorkoutPlan(
      program,
      { name: 'Arms' },
      buildPlanExerciseFromQuickAdd({
        name: 'Hammer Curl',
        sets: 4,
        muscle: 'Biceps',
      }),
      { name: 'Curl' },
    )

    expect(next.workouts.Arms.map((item) => item.name)).toEqual([
      'Curl',
      'Hammer Curl',
      'Pushdown',
    ])
    expect(next.workouts.Arms[1]).toMatchObject({
      name: 'Hammer Curl',
      sets: 4,
      muscle: 'Biceps',
      supersetGroup: '',
    })
    expect(program.workouts.Arms).toHaveLength(2)
  })

  it('removes the chosen exercise from the saved plan without mutating input', () => {
    const next = removeExerciseFromWorkoutPlan(
      program,
      { name: 'Arms' },
      { name: 'Pushdown' },
    )

    expect(next.workouts.Arms.map((item) => item.name)).toEqual(['Curl'])
    expect(program.workouts.Arms.map((item) => item.name)).toEqual([
      'Curl',
      'Pushdown',
    ])
  })
})
