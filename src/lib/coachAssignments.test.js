import { describe, expect, it } from 'vitest'
import {
  assignmentDueToday,
  resolveActiveCoachAssignment,
} from './coachAssignments'
import { buildAvaDailyBriefing } from './avaIntelligence'
import { resolveTodayWorkoutContext, WORKOUT_SOURCE } from './todayWorkout'

const today = '2026-08-07'
const morning = new Date(`${today}T09:00:00`)
const afternoon = new Date(`${today}T14:00:00`)

describe('coachAssignments', () => {
  it('CASE A1: active assignment overrides program rotation', () => {
    const assignments = [
      {
        id: 'assign-1',
        status: 'assigned',
        title: 'Chest and Back',
        due_date: '2026-08-08',
        workout_payload: {
          name: 'Chest and Back',
          exercises: [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
        },
      },
    ]

    const state = {
      selectedWorkout: 'Arms',
      program: { nextWorkout: 'Arms', workouts: {} },
      weeklySchedule: { 5: 'Arms' },
      history: [
        {
          id: 's1',
          date: '2026-08-06',
          sets: [{ exercise: 'Bench Press', weight: 135, reps: 8 }],
        },
      ],
      readiness: {
        entries: [
          {
            id: 'r1',
            date: today,
            sleep: 4,
            energy: 4,
            soreness: 2,
            stress: 2,
          },
        ],
      },
      mobility: {
        completed: [
          { flowId: 'daily-reset', completedAt: afternoon.toISOString() },
          { flowId: 'recovery-flow', completedAt: afternoon.toISOString() },
        ],
      },
    }

    const active = resolveActiveCoachAssignment(assignments, morning)
    const context = resolveTodayWorkoutContext(state, {
      now: morning,
      assignments,
    })
    const briefing = buildAvaDailyBriefing(state, {
      now: afternoon,
      assignments,
    })

    expect(active?.workout_payload?.name).toBe('Chest and Back')
    expect(context.displayName).toBe('Chest and Back')
    expect(context.source).toBe(WORKOUT_SOURCE.COACH_ASSIGNMENT)
    expect(briefing.workout.displayName).toBe('Chest and Back')
    expect(briefing.primaryAction?.label).toContain('Chest and Back')
  })

  it('CASE A2: uses program workout when no active assignment exists', () => {
    const state = {
      selectedWorkout: 'Arms',
      program: { nextWorkout: 'Arms', workouts: { Arms: [] } },
      weeklySchedule: { 5: 'Legs + Core' },
    }

    const context = resolveTodayWorkoutContext(state, {
      now: morning,
      assignments: [],
    })

    expect(context.displayName).toBe('Arms')
    expect(context.source).toBe(WORKOUT_SOURCE.SELECTED)
  })

  it('CASE A3: completed assignment does not override current workout', () => {
    const assignments = [
      {
        id: 'done-1',
        status: 'completed',
        title: 'Old Coach Day',
        due_date: today,
        workout_payload: { name: 'Old Coach Day', exercises: [] },
      },
    ]

    const state = {
      selectedWorkout: 'Arms',
      program: { nextWorkout: 'Arms', workouts: {} },
    }

    expect(resolveActiveCoachAssignment(assignments, morning)).toBeNull()
    expect(
      resolveTodayWorkoutContext(state, { now: morning, assignments })
        .displayName,
    ).toBe('Arms')
  })

  it('prefers started assignment over assigned', () => {
    const assignments = [
      {
        id: 'a1',
        status: 'assigned',
        title: 'Later',
        due_date: '2026-08-10',
        workout_payload: { name: 'Later', exercises: [] },
      },
      {
        id: 'a2',
        status: 'started',
        title: 'In Progress Coach Day',
        due_date: '2026-08-09',
        workout_payload: { name: 'In Progress Coach Day', exercises: [] },
      },
    ]

    expect(resolveActiveCoachAssignment(assignments, morning)?.id).toBe('a2')
  })

  it('assignmentDueToday only matches exact today date', () => {
    const assignments = [
      {
        id: 'future',
        status: 'assigned',
        title: 'Tomorrow',
        due_date: '2026-08-08',
      },
    ]

    expect(assignmentDueToday(assignments, morning)).toBeNull()
    expect(resolveActiveCoachAssignment(assignments, morning)).not.toBeNull()
  })
})
