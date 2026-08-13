import { describe, expect, it } from 'vitest'
import {
  advanceProgramNextWorkout,
  findCompletedWorkoutToday,
  resolveNextRecommendedWorkout,
  resolveWorkoutDaySummary,
  resolveWorkoutRecommendation,
  WORKOUT_RECOMMENDATION_STATE,
} from './programWorkout'

const rotation = ['Chest + Back', 'Arms', 'Legs + Core']

describe('programWorkout', () => {
  it('advances from completed workout position in rotation', () => {
    expect(
      advanceProgramNextWorkout({
        rotation,
        completedWorkoutName: 'Arms',
        currentNextWorkout: 'Arms',
      }),
    ).toBe('Legs + Core')
  })

  it('does not wrap to rotation[0] when completed workout name is missing from rotation', () => {
    expect(
      advanceProgramNextWorkout({
        rotation,
        completedWorkoutName: 'Coach Custom Upper',
        currentNextWorkout: 'Arms',
      }),
    ).toBe('Legs + Core')
  })

  it('regression: Arms completion should not jump to Chest + Back', () => {
    const state = {
      program: {
        rotation,
        nextWorkout: 'Legs + Core',
      },
      history: [
        {
          id: 'session-1',
          name: 'Arms',
          finishedAt: '2026-08-13T18:00:00.000Z',
        },
      ],
    }

    expect(resolveNextRecommendedWorkout(state, new Date('2026-08-13T20:00:00.000Z'))).toBe(
      'Legs + Core',
    )
  })

  it('does not promote next workout as today after same-day completion', () => {
    const completed = findCompletedWorkoutToday(
      [
        {
          id: 'done',
          name: 'Arms',
          finishedAt: '2026-08-13T18:00:00.000Z',
        },
      ],
      new Date('2026-08-13T20:00:00.000Z'),
    )

    expect(completed?.name).toBe('Arms')

    const summary = resolveWorkoutDaySummary(
      {
        program: { rotation, nextWorkout: 'Legs + Core' },
        history: [
          {
            id: 'done',
            name: 'Arms',
            finishedAt: '2026-08-13T18:00:00.000Z',
          },
        ],
      },
      {},
      new Date('2026-08-13T20:00:00.000Z'),
    )

    expect(summary.completedToday).toBe(true)
    expect(summary.nextRecommendedWorkout).toBe('Legs + Core')
    expect(summary.nextRecommendedLabel).toMatch(/Tomorrow/i)
  })

  it('swapped workout completion satisfies that rotation slot', () => {
    expect(
      advanceProgramNextWorkout({
        rotation,
        completedWorkoutName: 'Legs + Core',
        currentNextWorkout: 'Arms',
      }),
    ).toBe('Chest + Back')
  })

  it('canonical recommendation after Arms completion points to Legs + Core tomorrow', () => {
    const now = new Date('2026-08-13T20:00:00.000Z')
    const state = {
      selectedWorkout: null,
      program: {
        rotation,
        nextWorkout: 'Legs + Core',
        workouts: {
          'Chest + Back': [],
          Arms: [],
          'Legs + Core': [],
        },
      },
      weeklySchedule: {
        0: 'Rest',
        1: 'Chest + Back',
        2: 'Arms',
        3: 'Legs + Core',
        4: 'Chest + Back',
        5: 'Arms',
        6: 'Legs + Core',
      },
      history: [
        {
          id: 'done',
          name: 'Arms',
          finishedAt: '2026-08-13T18:00:00.000Z',
        },
      ],
      readiness: {
        entries: [
          {
            date: '2026-08-13',
            sleep: 4,
            energy: 4,
            soreness: 2,
            stress: 2,
            completedAt: '2026-08-13T08:00:00.000Z',
          },
        ],
      },
      mobility: {
        completed: [],
      },
    }

    const recommendation = resolveWorkoutRecommendation(state, {}, now)

    expect(recommendation.completedToday).toBe(true)
    expect(recommendation.completedWorkoutName).toBe('Arms')
    expect(recommendation.todayWorkout).toBeNull()
    expect(recommendation.nextWorkout).toBe('Legs + Core')
    expect(recommendation.recommendationState).toBe(
      WORKOUT_RECOMMENDATION_STATE.COMPLETED_TODAY,
    )
    expect(recommendation.canStartAnotherToday).toBe(true)
  })

  it('normalizes object-shaped program.nextWorkout after same-day completion', () => {
    const state = {
      program: {
        rotation,
        nextWorkout: { name: 'Legs + Core' },
        workouts: {
          'Chest + Back': [],
          Arms: [],
          'Legs + Core': [],
        },
      },
      history: [
        {
          id: 'done',
          name: 'Arms',
          finishedAt: '2026-08-13T18:00:00.000Z',
        },
      ],
    }

    expect(
      resolveNextRecommendedWorkout(state, new Date('2026-08-13T20:00:00.000Z')),
    ).toBe('Legs + Core')
  })
})
