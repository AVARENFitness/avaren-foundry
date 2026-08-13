import { describe, expect, it } from 'vitest'
import { buildAdaptiveDailyReset, workoutFocus } from './mobility'
import { resolveNextRecommendedWorkout } from '../lib/programWorkout'
import { resolveTodayWorkoutContext } from '../lib/todayWorkout'
import { calculateReadiness } from '../lib/readiness'

const today = '2026-08-13'

const buildCompletedArmsState = () => ({
  selectedWorkout: null,
  activeWorkout: null,
  program: {
    nextWorkout: { name: 'Legs + Core' },
    rotation: ['Chest + Back', 'Arms', 'Legs + Core'],
    workouts: {
      'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
      Arms: [{ name: 'Curls', sets: 3, muscle: 'Biceps' }],
      'Legs + Core': [{ name: 'Squat', sets: 3, muscle: 'Legs' }],
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
      id: 'arms-done',
      name: 'Arms',
      finishedAt: `${today}T16:00:00.000Z`,
      sets: [{ exercise: 'Curls', muscle: 'Biceps', weight: 30, reps: 10 }],
    },
  ],
  readiness: {
    entries: [
      {
        date: today,
        sleep: 4,
        energy: 4,
        soreness: 2,
        stress: 2,
        completedAt: `${today}T08:00:00.000Z`,
      },
    ],
  },
  mobility: {
    completed: [],
    durationPreferences: {},
    preferences: {},
  },
})

describe('mobility workoutFocus null safety', () => {
  it('returns neutral focus for null, undefined, and empty workout names', () => {
    expect(workoutFocus(null)).toEqual([])
    expect(workoutFocus(undefined)).toEqual([])
    expect(workoutFocus('')).toEqual([])
    expect(workoutFocus('   ')).toEqual([])
    expect(workoutFocus('Rest')).toEqual([])
  })

  it('still resolves known workout names', () => {
    expect(workoutFocus('Legs + Core')).toContain('quads')
    expect(workoutFocus('Arms')).toContain('arms')
  })
})

describe('buildAdaptiveDailyReset completed-today athlete state', () => {
  it('does not throw when workout due today is null after Arms completion', () => {
    const now = new Date(`${today}T18:00:00.000Z`)
    const state = buildCompletedArmsState()
    const workoutDueToday = resolveTodayWorkoutContext(state, { now }).name
    const nextScheduledWorkout = resolveNextRecommendedWorkout(state, now)

    expect(workoutDueToday).toBeNull()
    expect(nextScheduledWorkout).toBe('Legs + Core')

    const readiness = calculateReadiness(state, now)

    expect(() =>
      buildAdaptiveDailyReset({
        history: state.history,
        plannedWorkout: workoutDueToday,
        durationPreferences: state.mobility.durationPreferences,
        readiness,
        recentCompletions: state.mobility.completed,
        preferences: state.mobility.preferences,
      }),
    ).not.toThrow()

    const reset = buildAdaptiveDailyReset({
      history: state.history,
      plannedWorkout: workoutDueToday,
      durationPreferences: state.mobility.durationPreferences,
      readiness,
      recentCompletions: state.mobility.completed,
      preferences: state.mobility.preferences,
    })

    expect(reset.reason).toContain('Arms')
    expect(reset.reason).toMatch(/prepare for tomorrow/i)
    expect(reset.reason).not.toMatch(/Chest/i)
    expect(reset.reason).not.toMatch(/prepare you for Legs/i)
    expect(reset.movements.length).toBeGreaterThan(0)
  })
})
