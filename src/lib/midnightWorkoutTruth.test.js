import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findCompletedWorkoutToday,
  resolveWorkoutRecommendation,
  WORKOUT_RECOMMENDATION_STATE,
} from './programWorkout'
import { buildNotifications, NOTIFICATION_TYPES } from './notifications'
import { resolveMissedWorkoutObligations } from './missedWorkoutObligations'

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
  history: [
    {
      id: 'legs-friday',
      name: 'Legs + Core',
      finishedAt: '2026-08-15T02:30:00.000Z',
    },
  ],
}

describe('midnight workout truth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('treats Legs completion as today at Aug 14 11:59 PM local', () => {
    const now = atLocalTime('2026-08-14T12:00:00', 23, 59)
    vi.setSystemTime(now)

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

    expect(findCompletedWorkoutToday(state.history, now)?.name).toBe('Legs + Core')

    const recommendation = resolveWorkoutRecommendation(state, {}, now)
    expect(recommendation.completedToday).toBe(true)
    expect(recommendation.todayWorkout).toBeNull()
    expect(recommendation.nextWorkout).toBe('Chest + Back')
    expect(recommendation.nextWorkoutLabel).toMatch(/Tomorrow/i)
  })

  it('clears completedToday at Aug 15 12:01 AM local after Friday completion', () => {
    const now = atLocalTime('2026-08-15T00:00:00', 0, 1)
    vi.setSystemTime(now)

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

    expect(findCompletedWorkoutToday(state.history, now)).toBeUndefined()

    const recommendation = resolveWorkoutRecommendation(state, {}, now)
    expect(recommendation.completedToday).toBe(false)
    expect(recommendation.todayWorkout).toBe('Chest + Back')
    expect(recommendation.nextWorkoutLabel).toBe('Today')
    expect(recommendation.recommendationState).toBe(
      WORKOUT_RECOMMENDATION_STATE.WORKOUT_DUE_TODAY,
    )
    expect(String(recommendation.nextWorkoutLabel ?? '')).not.toMatch(/Sunday Aug 16/i)
  })

  it('does not treat a 23-hour-old workout as completed today after local midnight', () => {
    const completedAt = atLocalTime('2026-08-14T12:00:00', 20, 0)
    const now = atLocalTime('2026-08-15T00:00:00', 0, 1)
    vi.setSystemTime(now)

    expect(now.getTime() - completedAt.getTime()).toBeLessThan(24 * 3600000)

    const completed = findCompletedWorkoutToday(
      [{ id: '1', name: 'Legs + Core', finishedAt: completedAt.toISOString() }],
      now,
    )
    expect(completed).toBeUndefined()
  })

  it('produces the same midnight result after refresh timestamps', () => {
    const now = atLocalTime('2026-08-15T00:00:00', 0, 1)
    vi.setSystemTime(now)

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

    const first = resolveWorkoutRecommendation(state, {}, now)
    const second = resolveWorkoutRecommendation(state, {}, new Date(now.getTime()))
    expect(first).toEqual(second)
  })
})

describe('missed workout notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(atLocalTime('2026-08-15T00:00:00', 8, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not mark rotation guidance as missed after midnight', () => {
    const state = {
      ...baseState,
      history: [
        {
          id: 'legs-friday',
          name: 'Legs + Core',
          finishedAt: atLocalTime('2026-08-14T12:00:00', 20, 0).toISOString(),
        },
      ],
      notifications: { read: [], dismissed: [], actedOn: [] },
    }

    const notifications = buildNotifications(state)
    expect(
      notifications.some((entry) => entry.type === NOTIFICATION_TYPES.MISSED),
    ).toBe(false)
    expect(resolveMissedWorkoutObligations(state)).toEqual([])
  })

  it('does not create missed Arms when athlete trained Legs instead', () => {
    const notifications = buildNotifications({
      ...baseState,
      history: [
        {
          id: 'legs-friday',
          name: 'Legs + Core',
          finishedAt: atLocalTime('2026-08-14T12:00:00', 20, 0).toISOString(),
        },
      ],
      notifications: { read: [], dismissed: [], actedOn: [] },
    })

    expect(
      notifications.some(
        (entry) =>
          entry.type === NOTIFICATION_TYPES.MISSED &&
          /Arms/i.test(entry.title),
      ),
    ).toBe(false)
  })

  it('still surfaces overdue coach assignments as missed obligations', () => {
    const notifications = buildNotifications({
      ...baseState,
      history: [],
      coachAssignments: [
        {
          id: 'assign-1',
          status: 'assigned',
          due_date: '2026-08-13',
          workout_payload: { name: 'Coach Upper' },
        },
      ],
      notifications: { read: [], dismissed: [], actedOn: [] },
    })

    expect(
      notifications.some(
        (entry) =>
          entry.type === NOTIFICATION_TYPES.MISSED &&
          /Coach Upper/i.test(entry.title),
      ),
    ).toBe(true)
  })
})
