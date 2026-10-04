import { describe, expect, it } from 'vitest'
import {
  buildFloorWorkoutFromAssignment,
  flattenFloorWorkout,
  formatPreviousSet,
  previousPerformanceByExercise,
} from './coachFloorSession'

describe('coach floor session helpers', () => {
  it('builds fast-log exercises from a linked assignment', () => {
    const workout = buildFloorWorkoutFromAssignment({
      id: 'assignment-1',
      title: 'Lower A',
      workout_payload: {
        name: 'Lower A',
        exercises: [
          { name: 'Back Squat', muscle: 'Quads', sets: 3, reps: '6-8' },
        ],
      },
    })

    expect(workout.name).toBe('Lower A')
    expect(workout.assignmentId).toBe('assignment-1')
    expect(workout.exercises[0].name).toBe('Back Squat')
    expect(workout.exercises[0].sets).toHaveLength(3)
    expect(workout.exercises[0].targetReps).toBe('6-8')
  })

  it('flattens only entered/completed sets into athlete history shape', () => {
    const workout = {
      name: 'Lower A',
      exercises: [
        {
          name: 'Back Squat',
          muscle: 'Quads',
          loadType: 'external',
          sets: [
            { id: 's1', weight: '225', reps: '6', type: 'Working', completed: true },
            { id: 's2', weight: '', reps: '', type: 'Working', completed: false },
          ],
        },
      ],
    }

    expect(flattenFloorWorkout(workout)).toMatchObject({
      name: 'Lower A',
      exercisesPerformed: ['Back Squat'],
      sets: [
        {
          exercise: 'Back Squat',
          weight: 225,
          reps: 6,
          muscle: 'Quads',
        },
      ],
    })
  })

  it('uses recent history for previous-set context', () => {
    const map = previousPerformanceByExercise([
      {
        name: 'Lower A',
        finishedAt: '2026-10-03T18:00:00.000Z',
        sets: [
          { exercise: 'Back Squat', weight: 225, reps: 6 },
          { exercise: 'Back Squat', weight: 235, reps: 5 },
        ],
      },
    ])

    expect(map.get('back squat')).toHaveLength(2)
    expect(formatPreviousSet(map.get('back squat')[0])).toBe('225 × 6')
  })
})
