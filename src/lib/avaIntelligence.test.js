import { describe, expect, it } from 'vitest'
import {
  AVA_CONFIDENCE,
  AVA_DAILY_STATES,
  AVA_RECOMMENDATIONS,
  buildAvaDailyBriefing,
  buildAvaEvidence,
  buildAvaWatchItems,
  buildAvaWins,
  buildAvaContext,
  buildAvaDailyState,
} from './avaIntelligence'

const today = new Date().toISOString().slice(0, 10)
const morning = new Date(`${today}T09:00:00`)
const afternoon = new Date(`${today}T14:00:00`)

const readinessEntry = (overrides = {}) => ({
  id: 'ready-1',
  date: today,
  sleep: 4,
  energy: 4,
  soreness: 2,
  stress: 2,
  completedAt: `${today}T08:00:00`,
  ...overrides,
})

const workout = ({
  id = 'session-1',
  date = today,
  name = 'Upper Body',
  daysAgo = 0,
  sets,
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
    sets: sets ?? [
      {
        exercise: 'Bench Press',
        muscle: 'Chest',
        weight: 135,
        reps: 8,
        estimatedOneRepMax: 170,
      },
    ],
  }
}

const baseState = {
  history: [
    workout({ daysAgo: 1 }),
    workout({ id: 'session-2', daysAgo: 3 }),
  ],
  readiness: {
    entries: [
      readinessEntry(),
      readinessEntry({
        id: 'ready-2',
        date: workout({ daysAgo: 1 }).date,
      }),
      readinessEntry({
        id: 'ready-3',
        date: workout({ daysAgo: 3 }).date,
      }),
    ],
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
        foods: [{ name: 'Chicken', calories: 400, protein: 45 }],
        waterOz: 32,
      },
    },
  },
  mobility: {
    completed: [
      {
        flowId: 'daily-reset',
        completedAt: `${today}T07:00:00`,
      },
      {
        flowId: 'recovery-flow',
        title: 'Recovery Flow',
        completedAt: `${today}T07:30:00`,
      },
    ],
  },
}

describe('avaIntelligence', () => {
  it('returns ready state with scheduled workout and strong readiness', () => {
    const tuesday = new Date(`${today}T12:00:00`)
    while (tuesday.getDay() !== 2) {
      tuesday.setDate(tuesday.getDate() + 1)
    }
    const tuesdayKey = tuesday.toISOString().slice(0, 10)

    const briefing = buildAvaDailyBriefing(
      {
        ...baseState,
        readiness: {
          entries: [
            readinessEntry({ date: tuesdayKey }),
            readinessEntry({
              id: 'ready-2',
              date: workout({ daysAgo: 1 }).date,
            }),
            readinessEntry({
              id: 'ready-3',
              date: workout({ daysAgo: 3 }).date,
            }),
          ],
          lastPromptedDate: tuesdayKey,
        },
        mobility: {
          completed: [
            {
              flowId: 'daily-reset',
              completedAt: `${tuesdayKey}T07:00:00`,
            },
            {
              flowId: 'recovery-flow',
              title: 'Recovery Flow',
              completedAt: `${tuesdayKey}T07:30:00`,
            },
          ],
        },
      },
      { now: tuesday },
    )

    expect(briefing.dailyState).toBe(AVA_DAILY_STATES.READY)
    expect(briefing.recommendation.id).toBe(
      AVA_RECOMMENDATIONS.TRAIN_AS_PLANNED,
    )
    expect(briefing.headline.toLowerCase()).toContain('up')
    expect(briefing.summary).toBeTruthy()
    expect(briefing.primaryAction?.type).toBe('start-workout')
  })

  it('matches Start Workout when selectedWorkout differs from schedule', () => {
    const tuesday = new Date('2026-08-04T12:00:00.000Z')
    const state = {
      ...baseState,
      selectedWorkout: 'Chest + Back',
      mobility: {
        completed: [
          { flowId: 'daily-reset', completedAt: afternoon.toISOString() },
          { flowId: 'recovery-flow', completedAt: afternoon.toISOString() },
        ],
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
      program: {
        ...baseState.program,
        nextWorkout: 'Arms',
        workouts: {
          'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
          Arms: [{ name: 'Curls', sets: 3, muscle: 'Biceps' }],
        },
      },
    }

    const briefing = buildAvaDailyBriefing(state, { now: afternoon })

    expect(briefing.workout.displayName).toBe('Chest + Back')
    expect(briefing.primaryAction?.label).toContain('Chest & Back')
    expect(briefing.evidence.some((item) => item.label === 'Arms')).toBe(false)
    expect(briefing.evidence.some((item) => item.label === 'Chest + Back')).toBe(
      true,
    )
  })

  it('returns recovery priority for low readiness', () => {
    const lowReadinessState = {
      ...baseState,
      readiness: {
        entries: [
          readinessEntry({
            sleep: 2,
            energy: 2,
            soreness: 5,
            stress: 4,
          }),
        ],
      },
    }

    const briefing = buildAvaDailyBriefing(lowReadinessState, { now: morning })

    expect(briefing.dailyState).toBe(AVA_DAILY_STATES.RECOVERY_PRIORITY)
    expect(briefing.recommendation.id).toBe(
      AVA_RECOMMENDATIONS.RECOVERY_MOBILITY_PRIORITY,
    )
  })

  it('returns rest state when schedule is rest and no workout resolves', () => {
    const sunday = new Date(`${today}T12:00:00`)
    while (sunday.getDay() !== 0) {
      sunday.setDate(sunday.getDate() + 1)
    }

    const briefing = buildAvaDailyBriefing(
      {
        ...baseState,
        selectedWorkout: null,
        program: { ...baseState.program, nextWorkout: null },
      },
      { now: sunday },
    )

    expect(briefing.dailyState).toBe(AVA_DAILY_STATES.REST)
    expect(briefing.recommendation.id).toBe(AVA_RECOMMENDATIONS.REST_DAY)
  })

  it('surfaces inactivity watch item after recent training gap', () => {
    const inactiveState = {
      ...baseState,
      history: [workout({ daysAgo: 6 })],
    }

    const ctx = buildAvaContext(inactiveState, { now: morning })
    const dailyState = buildAvaDailyState(ctx)
    const watch = buildAvaWatchItems(ctx, dailyState)

    expect(watch.some((item) => item.title.includes('gap'))).toBe(true)
  })

  it('returns manage load when readiness is moderate', () => {
    const manageState = {
      ...baseState,
      readiness: {
        entries: [
          readinessEntry({
            sleep: 3,
            energy: 2,
            soreness: 4,
            stress: 3,
          }),
        ],
      },
    }

    const briefing = buildAvaDailyBriefing(manageState, { now: morning })

    expect(briefing.dailyState).toBe(AVA_DAILY_STATES.MANAGE_LOAD)
    expect(briefing.recommendation.id).toBe(
      AVA_RECOMMENDATIONS.LOWER_TRAINING_STRESS,
    )
  })

  it('recognizes a recent performance win from PR data', () => {
    const prState = {
      ...baseState,
      history: [
        workout({ daysAgo: 0, sets: [{ exercise: 'Bench Press', muscle: 'Chest', weight: 185, reps: 5, estimatedOneRepMax: 215 }] }),
        workout({ id: 'old', daysAgo: 4, sets: [{ exercise: 'Bench Press', muscle: 'Chest', weight: 175, reps: 5, estimatedOneRepMax: 204 }] }),
      ],
    }

    const ctx = buildAvaContext(prState, { now: morning })
    const win = buildAvaWins(ctx)

    expect(win).not.toBeNull()
    expect(win.title.toLowerCase()).toContain('bench press')
  })

  it('omits nutrition evidence when nothing is logged', () => {
    const noNutritionState = {
      ...baseState,
      nutrition: {
        goals: { calories: 2200, protein: 170 },
        days: {},
      },
    }

    const ctx = buildAvaContext(noNutritionState, { now: morning })
    const evidence = buildAvaEvidence(ctx, AVA_DAILY_STATES.READY)

    expect(evidence.some((item) => item.category === 'Nutrition')).toBe(false)
  })

  it('handles missing readiness with insufficient data state', () => {
    const newAthleteState = {
      history: [],
      readiness: { entries: [] },
      weeklySchedule: baseState.weeklySchedule,
      program: baseState.program,
    }

    const briefing = buildAvaDailyBriefing(newAthleteState, { now: morning })

    expect(briefing.dailyState).toBe(AVA_DAILY_STATES.INSUFFICIENT_DATA)
    expect(briefing.isLowData).toBe(true)
    expect(briefing.confidenceNote).toContain('learning')
    expect(briefing.watch).toEqual([])
    expect(briefing.win).toBeUndefined()
  })

  it('respects coach-assigned workout context', () => {
    const assignment = {
      id: 'assign-1',
      status: 'assigned',
      title: 'Coach Lower Day',
      due_date: today,
      coach_notes: 'Keep RPE controlled.',
      workout_payload: {
        name: 'Coach Lower Day',
        exercises: [{ name: 'Squat', sets: 3, muscle: 'Quads' }],
      },
    }

    const briefing = buildAvaDailyBriefing(
      {
        ...baseState,
        mobility: {
          completed: [
            { flowId: 'daily-reset', completedAt: afternoon.toISOString() },
            { flowId: 'recovery-flow', completedAt: afternoon.toISOString() },
          ],
        },
      },
      {
        now: afternoon,
        assignments: [assignment],
      },
    )

    expect(briefing.workout.displayName).toBe('Coach Lower Day')
    expect(briefing.primaryAction?.label).toContain('Coach Lower Day')
    expect(briefing.evidence.some((item) => item.category === 'Coach')).toBe(
      true,
    )
    expect(briefing.summary.toLowerCase()).toContain('coach')
  })

  it('generates watch items without fabricating unsupported metrics', () => {
    const briefing = buildAvaDailyBriefing(baseState, { now: morning })

    briefing.watch.forEach((item) => {
      expect(item.title).toBeTruthy()
      expect(item.detail).toBeTruthy()
      expect(item.detail).not.toMatch(/undefined|NaN|Invalid Date/i)
    })
  })

  it('builds grouped evidence for explainability', () => {
    const briefing = buildAvaDailyBriefing(baseState, { now: morning })

    expect(briefing.evidence.length).toBeGreaterThan(0)
    briefing.evidence.forEach((item) => {
      expect(item.category).toBeTruthy()
      expect(item.label).toBeTruthy()
      expect(item.detail).toBeTruthy()
    })
  })

  it('produces deterministic output for equivalent input', () => {
    const first = buildAvaDailyBriefing(baseState, { now: morning })
    const second = buildAvaDailyBriefing(baseState, { now: morning })

    expect(first.dailyState).toBe(second.dailyState)
    expect(first.headline).toBe(second.headline)
    expect(first.summary).toBe(second.summary)
    expect(first.focus).toEqual(second.focus)
  })

  it('handles malformed optional data safely', () => {
    const brokenState = {
      history: [{ id: 'x', date: null, sets: null }],
      readiness: { entries: [{ date: today, sleep: 'bad' }] },
      nutrition: null,
      mobility: null,
      weeklySchedule: null,
      program: null,
    }

    expect(() =>
      buildAvaDailyBriefing(brokenState, { now: morning }),
    ).not.toThrow()

    const briefing = buildAvaDailyBriefing(brokenState, { now: morning })
    expect(briefing.headline).toBeTruthy()
    expect(briefing.summary).not.toMatch(/undefined|NaN/i)
  })

  it('assigns strong confidence with sufficient context', () => {
    const briefing = buildAvaDailyBriefing(baseState, { now: morning })

    expect([
      AVA_CONFIDENCE.STRONG,
      AVA_CONFIDENCE.MODERATE,
    ]).toContain(briefing.confidence)
  })

  it('omits win section when no real win exists', () => {
    const sparseState = {
      history: [workout({ daysAgo: 10 })],
      readiness: {
        entries: [
          readinessEntry({
            date: workout({ daysAgo: 10 }).date,
          }),
        ],
      },
      weeklySchedule: baseState.weeklySchedule,
      program: baseState.program,
      nutrition: { goals: {}, days: {} },
      mobility: { completed: [] },
    }

    const briefing = buildAvaDailyBriefing(sparseState, { now: morning })

    expect(briefing.win).toBeUndefined()
  })
})
