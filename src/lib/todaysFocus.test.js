import { describe, expect, it } from 'vitest'
import {
  deriveTodaysFocus,
  FOCUS_ACTIONS,
  FOCUS_TYPES,
} from './todaysFocus'

const today = new Date().toISOString().slice(0, 10)
const now = new Date()
now.setHours(15, 0, 0, 0)

const readinessEntry = (overrides = {}) => ({
  id: 'ready-1',
  date: today,
  sleep: 3,
  energy: 3,
  soreness: 3,
  stress: 3,
  completedAt: `${today}T08:00:00`,
  ...overrides,
})

const workout = ({
  id = 'session-1',
  date = today,
  name = 'Upper Body',
  daysAgo = 0,
} = {}) => {
  const sessionDate = new Date(`${today}T12:00:00`)
  sessionDate.setDate(sessionDate.getDate() - daysAgo)
  const key = sessionDate.toISOString().slice(0, 10)

  return {
    id,
    name,
    date: key,
    startedAt: `${key}T10:00:00`,
    finishedAt: `${key}T11:00:00`,
    sets: [
      {
        exercise: 'Bench Press',
        muscle: 'Chest',
        weight: 135,
        reps: 8,
      },
    ],
  }
}

const baseState = {
  history: [workout({ daysAgo: 1 })],
  readiness: {
    entries: [readinessEntry()],
    lastPromptedDate: today,
  },
  weeklySchedule: [
    'Rest',
    'Upper Body',
    'Lower Body',
    'Upper Body',
    'Lower Body',
    'Full Body',
    'Rest',
  ],
  selectedWorkout: 'Upper Body',
  program: {
    nextWorkout: 'Upper Body',
    rotation: ['Upper Body', 'Lower Body'],
    workouts: {},
  },
  nutrition: {
    goals: { calories: 2200, protein: 170 },
    days: {
      [today]: {
        date: today,
        foods: [],
        waterOz: 0,
      },
    },
  },
  mobility: { completed: [] },
}

describe('deriveTodaysFocus', () => {
  it('prioritizes an active workout over everything else', () => {
    const focus = deriveTodaysFocus(
      {
        ...baseState,
        activeWorkout: {
          id: 'active-1',
          name: 'Push Day',
        },
      },
      { now },
    )

    expect(focus.type).toBe(FOCUS_TYPES.TRAIN)
    expect(focus.action).toBe(FOCUS_ACTIONS.CONTINUE_WORKOUT)
    expect(focus.actionLabel).toBe('Continue Workout')
    expect(focus.title).toBe('Push Day')
  })

  it('prioritizes a coach assignment due today over planned training', () => {
    const focus = deriveTodaysFocus(baseState, {
      now,
      assignmentDueToday: {
        id: 'assign-1',
        title: 'Coach Push Session',
        due_date: today,
        coach_notes: 'Focus on tempo work.',
      },
    })

    expect(focus.type).toBe(FOCUS_TYPES.TRAIN)
    expect(focus.action).toBe(FOCUS_ACTIONS.START_WORKOUT)
    expect(focus.title).toBe('Coach Push Session')
  })

  it('recommends recovery when readiness supports a recovery day', () => {
    const focus = deriveTodaysFocus(
      {
        ...baseState,
        readiness: {
          entries: [
            readinessEntry({
              sleep: 1,
              energy: 1,
              soreness: 5,
              stress: 5,
            }),
          ],
        },
      },
      { now },
    )

    expect(focus.type).toBe(FOCUS_TYPES.RECOVER)
    expect(focus.action).toBe(FOCUS_ACTIONS.BEGIN_RECOVERY)
    expect(focus.actionLabel).toBe('Begin Recovery')
  })

  it('surfaces nutrition focus when afternoon logging is behind', () => {
    const focus = deriveTodaysFocus(
      {
        ...baseState,
        nutrition: {
          ...baseState.nutrition,
          days: {
            [today]: {
              date: today,
              foods: [],
              waterOz: 0,
            },
          },
        },
      },
      { now: (() => {
        const afternoon = new Date()
        afternoon.setHours(16, 0, 0, 0)
        return afternoon
      })() },
    )

    expect(focus.type).toBe(FOCUS_TYPES.NUTRITION)
    expect(focus.action).toBe(FOCUS_ACTIONS.LOG_FOOD)
    expect(focus.actionLabel).toBe('Log Food')
  })

  it('falls back to a check-in for new athletes without history', () => {
    const focus = deriveTodaysFocus(
      {
        ...baseState,
        history: [],
        readiness: { entries: [] },
      },
      { now },
    )

    expect(focus.type).toBe(FOCUS_TYPES.CONSISTENCY)
    expect(focus.action).toBe(FOCUS_ACTIONS.CHECK_IN)
    expect(focus.title).toBe('Start with a check-in')
  })

  it('maps primary actions to the expected labels', () => {
    const continueFocus = deriveTodaysFocus(
      {
        ...baseState,
        activeWorkout: { name: 'Leg Day' },
      },
      { now },
    )
    expect(continueFocus.action).toBe(FOCUS_ACTIONS.CONTINUE_WORKOUT)
    expect(continueFocus.actionLabel).toBe('Continue Workout')

    const morning = new Date()
    morning.setHours(9, 0, 0, 0)
    const startFocus = deriveTodaysFocus(baseState, { now: morning })
    expect(startFocus.action).toBe(FOCUS_ACTIONS.START_WORKOUT)
    expect(startFocus.actionLabel).toBe('Start Workout')

    const checkInFocus = deriveTodaysFocus(
      {
        ...baseState,
        history: [],
      },
      { now },
    )
    expect(checkInFocus.action).toBe(FOCUS_ACTIONS.CHECK_IN)
    expect(checkInFocus.actionLabel).toBe('Check In')
  })
})
