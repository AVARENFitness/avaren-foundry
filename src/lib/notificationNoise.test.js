import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildNotifications,
  NOTIFICATION_TYPES,
  workoutNotifications,
} from './notifications'
import { resolveWorkoutRecommendation } from './programWorkout'
import { createNutritionState } from './nutrition'
import {
  resolveCurrentWeeklyCheckInState,
  WEEKLY_CHECK_IN_STATUS,
} from './weeklyCheckIn'
import { WEEKLY_CHECKIN_CAPABILITY_STATUS } from './weeklyCheckInCapability'

const rotation = ['Chest + Back', 'Arms', 'Legs + Core']

const atLocalTime = (dateSeed, hour, minute = 0) => {
  const date = new Date(dateSeed)
  date.setHours(hour, minute, 0, 0)
  return date
}

const baseState = {
  selectedWorkout: null,
  program: {
    rotation,
    nextWorkout: 'Chest + Back',
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
  history: [],
  mobility: { completed: [], durationPreferences: {} },
  readiness: { entries: [], lastPromptedDate: null },
  nutrition: createNutritionState(),
  notifications: { read: [], dismissed: [], actedOn: [] },
}

describe('notification noise — routine workouts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(atLocalTime('2026-08-15T00:00:00', 8, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not create routine workout notifications when today workout is available', () => {
    const now = new Date()
    const recommendation = resolveWorkoutRecommendation(baseState, {}, now)
    expect(recommendation.todayWorkout).toBe('Chest + Back')

    expect(workoutNotifications(baseState)).toEqual([])
    const notifications = buildNotifications(baseState)
    expect(
      notifications.some((entry) => entry.type === NOTIFICATION_TYPES.WORKOUT),
    ).toBe(false)
  })

  it('does not add a workout notification after midnight rollover', () => {
    const state = {
      ...baseState,
      history: [
        {
          id: 'legs-friday',
          name: 'Legs + Core',
          finishedAt: atLocalTime('2026-08-14T12:00:00', 20, 0).toISOString(),
        },
      ],
    }

    const notifications = buildNotifications(state)
    expect(
      notifications.some(
        (entry) =>
          entry.type === NOTIFICATION_TYPES.WORKOUT &&
          /Chest \+ Back/i.test(entry.title),
      ),
    ).toBe(false)
  })

  it('still creates overdue coach assignment notifications', () => {
    const notifications = buildNotifications({
      ...baseState,
      coachAssignments: [
        {
          id: 'assign-1',
          status: 'assigned',
          due_date: '2026-08-13',
          workout_payload: { name: 'Coach Upper' },
        },
      ],
    })

    expect(
      notifications.some(
        (entry) =>
          entry.type === NOTIFICATION_TYPES.MISSED &&
          /Coach Upper/i.test(entry.title),
      ),
    ).toBe(true)
  })

  it('still creates weekly check-in notifications when required and due', () => {
    const dueState = resolveCurrentWeeklyCheckInState({
      capability: {
        status: WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE,
        schemaAvailable: true,
      },
      status: {
        status: WEEKLY_CHECK_IN_STATUS.OVERDUE,
        weekKey: '2026-08-10',
        weekRange: { weekStart: '2026-08-10', weekEnd: '2026-08-16' },
        submitted: false,
      },
      loading: false,
    })

    const notifications = buildNotifications({
      ...baseState,
      weeklyCheckInRequired: true,
      weeklyCheckInState: dueState,
      weeklyCheckInCapability: {
        status: WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE,
        schemaAvailable: true,
      },
    })

    expect(
      notifications.some(
        (entry) => entry.type === NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      ),
    ).toBe(true)
  })

  it('suppresses weekly check-in notifications when not required', () => {
    const dueState = resolveCurrentWeeklyCheckInState({
      capability: {
        status: WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE,
        schemaAvailable: true,
      },
      status: {
        status: WEEKLY_CHECK_IN_STATUS.NOT_REQUIRED,
        weekKey: '2026-08-10',
        weekRange: { weekStart: '2026-08-10', weekEnd: '2026-08-16' },
        submitted: false,
      },
      loading: false,
    })

    const notifications = buildNotifications({
      ...baseState,
      weeklyCheckInRequired: false,
      weeklyCheckInState: dueState,
      weeklyCheckInCapability: {
        status: WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE,
        schemaAvailable: true,
      },
    })

    expect(
      notifications.some(
        (entry) => entry.type === NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      ),
    ).toBe(false)
  })
})
