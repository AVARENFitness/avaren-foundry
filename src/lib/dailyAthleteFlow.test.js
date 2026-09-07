import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAILY_FLOW_STATUS,
  DAILY_FLOW_STEP,
  isMorningMovementFlowCompletion,
  isRecoveryFlowCompletion,
  mobilityKindCompletedToday,
  resolveDailyAthleteFlow,
  withMorningMovementSkippedForToday,
} from './dailyAthleteFlow'
import { createNutritionState } from './nutrition'

const atLocalTime = (dateSeed, hour, minute = 0) => {
  const date = new Date(dateSeed)
  date.setHours(hour, minute, 0, 0)
  return date
}

const fridayMorning = atLocalTime('2026-08-07T12:00:00', 8)
const fridayAfternoon = atLocalTime('2026-08-07T12:00:00', 14)
const saturdayMorning = atLocalTime('2026-08-08T12:00:00', 8)

const baseState = ({
  history = [],
  mobility = { completed: [], durationPreferences: {}, daily: {} },
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
  weeklySchedule: {
    0: 'Rest',
    1: 'Chest + Back',
    2: 'Arms',
    3: 'Legs + Core',
    4: 'Chest + Back',
    5: 'Arms',
    6: 'Legs + Core',
  },
  history,
  mobility,
  activeWorkout,
  nutrition: createNutritionState(),
})

describe('dailyAthleteFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('matches production recovery and morning completion identities', () => {
    expect(
      isRecoveryFlowCompletion({
        flowId: 'recovery-session-1',
        title: 'Daily Reset',
      }),
    ).toBe(true)
    expect(
      isRecoveryFlowCompletion({
        flowId: 'recovery-session-1',
        title: 'Recovery Flow',
      }),
    ).toBe(true)
    expect(
      isMorningMovementFlowCompletion({
        flowId: 'daily-reset-2026-08-07',
        title: 'Morning Movement',
      }),
    ).toBe(true)
  })

  it('prioritizes check-in when readiness is due', () => {
    vi.setSystemTime(fridayMorning)
    const flow = resolveDailyAthleteFlow({
      now: fridayMorning,
      state: baseState(),
      readinessDue: true,
      readiness: { completed: false },
      loadAdjusted: true,
      readinessFactors: [{ concern: true }],
    })
    expect(flow.primaryStep).toBe(DAILY_FLOW_STEP.CHECK_IN)
  })

  it('advances to morning movement after check-in', () => {
    vi.setSystemTime(fridayMorning)
    const flow = resolveDailyAthleteFlow({
      now: fridayMorning,
      state: baseState(),
      readinessDue: false,
      readiness: { completed: true },
      loadAdjusted: true,
      readinessFactors: [{ concern: true }],
    })
    expect(flow.primaryStep).toBe(DAILY_FLOW_STEP.MORNING_MOVEMENT)
    expect(flow.morningMovement.due).toBe(true)
  })

  it('marks morning movement skipped when workout starts and keeps it skipped that day', () => {
    vi.setSystemTime(fridayMorning)
    const started = withMorningMovementSkippedForToday(
      baseState({ activeWorkout: { id: 'aw-1', name: 'Arms' } }),
      fridayMorning,
    )
    expect(started.mobility.daily.morningSkippedForDate).toBe('2026-08-07')

    const flow = resolveDailyAthleteFlow({
      now: fridayMorning,
      state: started,
      readiness: { completed: true },
      loadAdjusted: true,
      readinessFactors: [{ concern: true }],
    })
    expect(flow.morningMovement.status).toBe(
      DAILY_FLOW_STATUS.SKIPPED_FOR_TODAY,
    )
    expect(flow.primaryStep).not.toBe(DAILY_FLOW_STEP.MORNING_MOVEMENT)

    vi.setSystemTime(fridayAfternoon)
    const later = resolveDailyAthleteFlow({
      now: fridayAfternoon,
      state: {
        ...started,
        activeWorkout: null,
        history: [
          {
            id: 'done',
            name: 'Arms',
            finishedAt: atLocalTime('2026-08-07T12:00:00', 13).toISOString(),
            sets: [],
          },
        ],
      },
      readiness: { completed: true },
    })
    expect(later.morningMovement.skippedForToday).toBe(true)
    expect(later.morningMovement.due).toBe(false)
  })

  it('restores morning eligibility on the next local day after a skip', () => {
    vi.setSystemTime(saturdayMorning)
    const flow = resolveDailyAthleteFlow({
      now: saturdayMorning,
      state: baseState({
        mobility: {
          completed: [],
          daily: { morningSkippedForDate: '2026-08-07' },
        },
      }),
      readiness: { completed: true },
      loadAdjusted: true,
      readinessFactors: [{ concern: true }],
    })
    expect(flow.morningMovement.skippedForToday).toBe(false)
    expect(flow.morningMovement.due).toBe(true)
  })

  it('makes recovery due after workout and clears it when completed with production ids', () => {
    const completedAt = atLocalTime('2026-08-07T12:00:00', 10)
    const now = new Date(completedAt.getTime() + 20 * 60 * 1000)
    vi.setSystemTime(now)

    const due = resolveDailyAthleteFlow({
      now,
      state: baseState({
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
    expect(due.recovery.due).toBe(true)
    expect(due.primaryStep).toBe(DAILY_FLOW_STEP.RECOVERY)

    const done = resolveDailyAthleteFlow({
      now,
      state: baseState({
        history: [
          {
            id: 'done',
            name: 'Arms',
            finishedAt: completedAt.toISOString(),
            sets: [],
          },
        ],
        mobility: {
          completed: [
            {
              flowId: 'recovery-done',
              title: 'Daily Reset',
              completedAt: now.toISOString(),
            },
          ],
          daily: {},
        },
      }),
      readiness: { completed: true },
    })
    expect(done.recovery.completed).toBe(true)
    expect(done.recovery.due).toBe(false)
    expect(done.requiredFlowComplete).toBe(true)
    expect(done.stretch.optionalAvailable).toBe(true)
  })

  it('does not carry unfinished recovery into the next local day', () => {
    vi.setSystemTime(saturdayMorning)
    const flow = resolveDailyAthleteFlow({
      now: saturdayMorning,
      state: baseState({
        history: [
          {
            id: 'yesterday',
            name: 'Arms',
            finishedAt: atLocalTime('2026-08-07T12:00:00', 16).toISOString(),
            sets: [],
          },
        ],
      }),
      readiness: { completed: true },
      loadAdjusted: true,
      readinessFactors: [{ concern: true }],
    })
    expect(flow.todayTrained).toBe(false)
    expect(flow.recovery.due).toBe(false)
    expect(flow.recovery.notYetRelevant).toBe(true)
  })
})
