import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAthleteHomeState,
  HOME_ACTION_IDS,
  isMorningMovementWindow,
  isWithinPostWorkoutRecoveryWindow,
  MORNING_MOVEMENT_END_HOUR,
  POST_WORKOUT_RECOVERY_WINDOW_MS,
  shouldSuppressWorkoutReminder,
} from './athleteHomeState'
import { buildNotifications, NOTIFICATION_TYPES } from './notifications'
import { createNutritionState } from './nutrition'

const atLocalTime = (dateSeed, hour, minute = 0) => {
  const date = new Date(dateSeed)
  date.setHours(hour, minute, 0, 0)
  return date
}

const fridayMorning = atLocalTime('2026-08-07T12:00:00', 8)
const fridayAfternoon = atLocalTime('2026-08-07T12:00:00', 14)
const fridayLateMorning = atLocalTime('2026-08-07T12:00:00', 11, 30)
const saturdayMorning = atLocalTime('2026-08-08T12:00:00', 8)

const baseWeeklySchedule = {
  0: 'Rest',
  1: 'Chest + Back',
  2: 'Arms',
  3: 'Legs + Core',
  4: 'Chest + Back',
  5: 'Arms',
  6: 'Legs + Core',
}

const buildState = ({
  history = [],
  mobility = { completed: [], durationPreferences: {} },
  activeWorkout = null,
} = {}) => ({
  program: {
    nextWorkout: { name: 'Legs + Core' },
    rotation: ['Chest + Back', 'Arms', 'Legs + Core'],
    workouts: {
      'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
      Arms: [{ name: 'Curls', sets: 3, muscle: 'Biceps' }],
      'Legs + Core': [{ name: 'Squat', sets: 3, muscle: 'Legs' }],
    },
  },
  weeklySchedule: baseWeeklySchedule,
  history,
  mobility,
  activeWorkout,
  nutrition: createNutritionState(),
  readiness: { entries: [], lastPromptedDate: null },
})

describe('athleteHomeState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows morning movement as primary during the morning window when suggested', () => {
    vi.setSystemTime(fridayMorning)

    const home = getAthleteHomeState({
      now: fridayMorning,
      state: buildState(),
      readiness: { completed: true, factors: [{ concern: true, label: 'Sleep' }] },
      loadAdjusted: true,
    })

    expect(home.primaryAction?.id).toBe(HOME_ACTION_IDS.MORNING_MOVEMENT)
    expect(home.sections.morningMovementPrimary).toBe(true)
  })

  it('removes morning movement from primary after 11 AM local time', () => {
    vi.setSystemTime(fridayLateMorning)
    expect(isMorningMovementWindow(fridayLateMorning)).toBe(false)

    const home = getAthleteHomeState({
      now: fridayLateMorning,
      state: buildState(),
      readiness: { completed: true, factors: [{ concern: true, label: 'Sleep' }] },
      loadAdjusted: true,
    })

    expect(home.primaryAction?.id).not.toBe(HOME_ACTION_IDS.MORNING_MOVEMENT)
    expect(home.sections.morningMovementPrimary).toBe(false)
  })

  it('suppresses start workout after today is completed', () => {
    vi.setSystemTime(fridayAfternoon)

    const home = getAthleteHomeState({
      now: fridayAfternoon,
      state: buildState({
        history: [
          {
            id: 'done',
            name: 'Arms',
            finishedAt: atLocalTime('2026-08-07T12:00:00', 13, 0).toISOString(),
            sets: [],
          },
        ],
      }),
      readiness: { completed: true },
    })

    expect(home.todayTrained).toBe(true)
    expect(home.primaryAction?.id).not.toBe(HOME_ACTION_IDS.START_WORKOUT)
    expect(home.sections.showStartWorkoutPrimary).toBe(false)
    expect(home.suppressWorkoutReminder).toBe(true)
  })

  it('does not promote tomorrow workout as today after completion', () => {
    vi.setSystemTime(fridayAfternoon)

    const home = getAthleteHomeState({
      now: fridayAfternoon,
      state: buildState({
        history: [
          {
            id: 'done',
            name: 'Arms',
            finishedAt: atLocalTime('2026-08-07T12:00:00', 13, 0).toISOString(),
            sets: [],
          },
        ],
      }),
      readiness: { completed: true },
    })

    expect(home.recommendation.completedToday).toBe(true)
    expect(home.recommendation.todayWorkout).toBeNull()
    expect(home.sections.showNextWorkoutPreview).toBe(false)
  })

  it('shows recovery prominently inside the post-workout window', () => {
    const completedAt = atLocalTime('2026-08-07T12:00:00', 10, 0)
    const now = new Date(completedAt.getTime() + 15 * 60 * 1000)
    vi.setSystemTime(now)

    const home = getAthleteHomeState({
      now,
      state: buildState({
        history: [
          {
            id: 'done',
            name: 'Arms',
            finishedAt: completedAt.toISOString(),
            sets: [],
          },
        ],
      }),
      readiness: { completed: true },
    })

    expect(
      isWithinPostWorkoutRecoveryWindow(
        completedAt.getTime(),
        now,
        POST_WORKOUT_RECOVERY_WINDOW_MS,
      ),
    ).toBe(true)
    expect(home.primaryAction?.id).toBe(HOME_ACTION_IDS.RECOVERY_FLOW)
    expect(home.sections.recoveryPrimary).toBe(true)
  })

  it('removes recovery from primary home after the window expires', () => {
    const completedAt = atLocalTime('2026-08-07T12:00:00', 9, 0)
    const now = new Date(completedAt.getTime() + 90 * 60 * 1000)
    vi.setSystemTime(now)

    const home = getAthleteHomeState({
      now,
      state: buildState({
        history: [
          {
            id: 'done',
            name: 'Arms',
            finishedAt: completedAt.toISOString(),
            sets: [],
          },
        ],
      }),
      readiness: { completed: true },
    })

    expect(home.inRecoveryWindow).toBe(false)
    expect(home.primaryAction?.id).not.toBe(HOME_ACTION_IDS.RECOVERY_FLOW)
    expect(home.sections.recoveryPrimary).toBe(false)
  })

  it('produces the same recovery-window result after reload timestamps', () => {
    const completedAt = atLocalTime('2026-08-07T12:00:00', 10, 0)
    const now = new Date(completedAt.getTime() + 30 * 60 * 1000)
    vi.setSystemTime(now)

    const state = buildState({
      history: [
        {
          id: 'done',
          name: 'Arms',
          finishedAt: completedAt.toISOString(),
          sets: [],
        },
      ],
    })

    const first = getAthleteHomeState({
      now,
      state,
      readiness: { completed: true },
    })
    const second = getAthleteHomeState({
      now: new Date(now.getTime()),
      state,
      readiness: { completed: true },
    })

    expect(first.primaryAction?.id).toBe(second.primaryAction?.id)
    expect(first.inRecoveryWindow).toBe(second.inRecoveryWindow)
  })

  it('prioritizes nutrition after workout completion outside recovery window', () => {
    vi.setSystemTime(fridayAfternoon)

    const home = getAthleteHomeState({
      now: fridayAfternoon,
      state: buildState({
        history: [
          {
            id: 'done',
            name: 'Arms',
            finishedAt: atLocalTime('2026-08-07T12:00:00', 13, 0).toISOString(),
            sets: [],
          },
        ],
        mobility: {
          completed: [
            {
              flowId: 'recovery-flow',
              completedAt: '2026-08-07T16:30:00.000Z',
            },
          ],
          durationPreferences: {},
        },
      }),
      readiness: { completed: true },
      nutritionSummary: { calories: 0, goal: 2200, protein: 0 },
    })

    expect(home.primaryAction?.id).toBe(HOME_ACTION_IDS.NUTRITION)
    expect(home.sections.nutritionPrimary).toBe(true)
  })

  it('suppresses workout reminder notifications after today is completed', () => {
    vi.setSystemTime(fridayAfternoon)

    const state = buildState({
      history: [
        {
          id: 'done',
          name: 'Arms',
          finishedAt: '2026-08-07T16:00:00.000Z',
          sets: [],
        },
      ],
    })

    expect(
      shouldSuppressWorkoutReminder({
        todayTrained: true,
        activeWorkout: null,
      }),
    ).toBe(true)

    const notifications = buildNotifications({
      ...state,
      notifications: { read: [], dismissed: [], actedOn: [] },
    })

    expect(
      notifications.some(
        (notification) => notification.type === NOTIFICATION_TYPES.WORKOUT,
      ),
    ).toBe(false)
  })

  it('restores normal training eligibility on a new calendar day', () => {
    vi.setSystemTime(saturdayMorning)

    const home = getAthleteHomeState({
      now: saturdayMorning,
      state: buildState({
        history: [
          {
            id: 'yesterday',
            name: 'Arms',
            finishedAt: '2026-08-07T16:00:00.000Z',
            sets: [],
          },
        ],
      }),
      readiness: { completed: true },
    })

    expect(home.todayTrained).toBe(false)
    expect(home.primaryAction?.id).toBe(HOME_ACTION_IDS.START_WORKOUT)
    expect(home.suppressWorkoutReminder).toBe(false)
  })

  it('surfaces upcoming appointment in schedule-oriented home actions', () => {
    vi.setSystemTime(fridayMorning)

    const appointment = {
      id: 'appt-1',
      sessionDate: '2026-08-08',
      startTime: '10:00',
      coachDisplayName: 'Coach Ava',
    }

    const home = getAthleteHomeState({
      now: fridayMorning,
      state: buildState(),
      readiness: { completed: true },
      nextAppointment: appointment,
    })

    expect(home.sections.nextAppointment).toBe(true)
    expect(
      home.secondaryActions.some(
        (action) => action.id === HOME_ACTION_IDS.APPOINTMENT,
      ),
    ).toBe(true)
  })

  it('keeps morning movement end hour at 11', () => {
    expect(MORNING_MOVEMENT_END_HOUR).toBe(11)
  })
})
