import { describe, expect, it } from 'vitest'
import {
  resolveTodayWorkoutContext,
  WORKOUT_SOURCE,
} from './todayWorkout'

const monday = new Date('2026-08-03T12:00:00.000Z') // Monday

const baseState = {
  selectedWorkout: 'Chest + Back',
  program: {
    nextWorkout: 'Arms',
    rotation: ['Chest + Back', 'Arms', 'Legs + Core'],
    workouts: {
      'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
      Arms: [{ name: 'Curls', sets: 3, muscle: 'Biceps' }],
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
}

describe('todayWorkout', () => {
  it('CASE 1: prefers selectedWorkout over scheduled Arms day', () => {
    const tuesday = new Date('2026-08-04T12:00:00.000Z')
    expect(tuesday.getDay()).toBe(2)

    const context = resolveTodayWorkoutContext(baseState, { now: tuesday })

    expect(context.displayName).toBe('Chest + Back')
    expect(context.source).toBe(WORKOUT_SOURCE.SELECTED)
    expect(context.displayName).not.toBe('Arms')
  })

  it('CASE 2: uses scheduled workout when selectedWorkout is absent', () => {
    const state = {
      ...baseState,
      selectedWorkout: null,
    }

    const context = resolveTodayWorkoutContext(state, { now: monday })

    expect(context.displayName).toBe('Chest + Back')
    expect(context.source).toBe(WORKOUT_SOURCE.SCHEDULED)
  })

  it('CASE 3: coach-assigned workout overrides rotation and selected workout', () => {
    const assignment = {
      id: 'assign-1',
      title: 'Coach Deload Upper',
      status: 'assigned',
      due_date: '2026-08-03',
      workout_payload: {
        name: 'Coach Deload Upper',
        exercises: [{ name: 'Pull-ups', sets: 3, muscle: 'Back' }],
      },
    }

    const context = resolveTodayWorkoutContext(baseState, {
      now: monday,
      assignments: [assignment],
    })

    expect(context.displayName).toBe('Coach Deload Upper')
    expect(context.source).toBe(WORKOUT_SOURCE.COACH_ASSIGNMENT)
    expect(context.assignmentId).toBe('assign-1')
  })

  it('CASE 4: returns no workout when nothing is scheduled or selected', () => {
    const state = {
      selectedWorkout: null,
      program: { nextWorkout: null, workouts: {} },
      weeklySchedule: { 1: 'Rest' },
    }

    const context = resolveTodayWorkoutContext(state, { now: monday })

    expect(context.name).toBeNull()
    expect(context.source).toBe(WORKOUT_SOURCE.NONE)
  })

  it('CASE 5: stale schedule cannot override selectedWorkout', () => {
    const state = {
      ...baseState,
      selectedWorkout: 'Chest + Back',
    }
    const tuesday = new Date('2026-08-04T12:00:00.000Z')

    const context = resolveTodayWorkoutContext(state, { now: tuesday })

    expect(context.displayName).toBe('Chest + Back')
    expect(context.scheduledWorkout).toBe('Arms')
    expect(context.source).toBe(WORKOUT_SOURCE.SELECTED)
  })

  it('uses active workout when a session is in progress', () => {
    const tuesday = new Date('2026-08-04T12:00:00.000Z')
    const state = {
      ...baseState,
      activeWorkout: {
        id: 'active-1',
        name: 'In-Progress Session',
      },
    }

    const context = resolveTodayWorkoutContext(state, { now: tuesday })

    expect(context.displayName).toBe('In-Progress Session')
    expect(context.source).toBe(WORKOUT_SOURCE.ACTIVE)
    expect(context.isStartable).toBe(false)
  })

  it('falls back to program.nextWorkout when selected and schedule are empty', () => {
    const state = {
      selectedWorkout: null,
      program: {
        nextWorkout: 'Legs + Core',
        workouts: { 'Legs + Core': [] },
      },
      weeklySchedule: { 1: 'Rest' },
    }

    const context = resolveTodayWorkoutContext(state, { now: monday })

    expect(context.displayName).toBe('Legs + Core')
    expect(context.source).toBe(WORKOUT_SOURCE.PROGRAM)
  })

  it('does not promote next rotation workout after completing today', () => {
    const state = {
      selectedWorkout: null,
      program: {
        nextWorkout: 'Arms',
        workouts: { 'Legs + Core': [], Arms: [] },
      },
      weeklySchedule: { 1: 'Rest' },
      history: [
        {
          id: 'done-1',
          name: 'Chest + Back',
          finishedAt: '2026-08-03T18:00:00.000Z',
        },
      ],
    }

    const context = resolveTodayWorkoutContext(state, { now: monday })

    expect(context.displayName).toBeNull()
    expect(context.source).toBe(WORKOUT_SOURCE.NONE)
  })
})
