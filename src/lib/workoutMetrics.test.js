import { describe, expect, it } from 'vitest'
import { recentPRs, sessionVolume } from './metrics'
import {
  getExerciseMeasurementMode,
  isValidStrengthSet,
  recentValidatedPRs,
  selectAvaPerformanceWin,
  sessionLoadVolume,
  setEstimatedOneRepMax,
  setLoadVolume,
  MEASUREMENT_MODES,
} from './workoutMetrics'
import { buildAvaDailyBriefing } from './avaIntelligence'

const session = (sets) => ({
  id: 'session-1',
  date: '2026-08-07',
  name: 'Test Day',
  sets,
})

describe('workoutMetrics', () => {
  it('CASE P1: ignores accidental load on Toe Touches', () => {
    const sets = [
      {
        exercise: 'Toe Touches',
        muscle: 'Core',
        weight: 300,
        reps: 10,
        estimatedOneRepMax: 400,
      },
    ]

    expect(getExerciseMeasurementMode('Toe Touches')).toBe(
      MEASUREMENT_MODES.BODYWEIGHT_REPS,
    )
    expect(isValidStrengthSet(sets[0])).toBe(false)
    expect(setLoadVolume(sets[0])).toBe(0)
    expect(setEstimatedOneRepMax(sets[0])).toBeNull()
    expect(sessionLoadVolume(session(sets))).toBe(0)
    expect(recentValidatedPRs([session(sets)])).toEqual([])
    expect(selectAvaPerformanceWin([session(sets)])).toBeNull()
  })

  it('CASE P2: validates Barbell Squat 225 × 5', () => {
    const set = {
      exercise: 'Barbell Squats',
      muscle: 'Quads',
      weight: 225,
      reps: 5,
    }

    expect(isValidStrengthSet(set)).toBe(true)
    expect(setLoadVolume(set)).toBe(1125)
    expect(setEstimatedOneRepMax(set)).toBeGreaterThan(250)
  })

  it('CASE P3: ignores malformed sets safely', () => {
    const malformed = [
      { exercise: 'Bench Press', weight: NaN, reps: 5 },
      { exercise: '', weight: 135, reps: 8 },
      { exercise: 'Bench Press', weight: 135, reps: 0 },
    ]

    malformed.forEach((set) => {
      expect(isValidStrengthSet(set)).toBe(false)
      expect(setLoadVolume(set)).toBe(0)
    })
  })

  it('CASE P4: duration-only values are not treated as load', () => {
    const set = {
      exercise: 'Plank',
      durationSeconds: 60,
      weight: 60,
      reps: 1,
    }

    expect(getExerciseMeasurementMode('Plank', set)).not.toBe(
      MEASUREMENT_MODES.WEIGHTED_REPS,
    )
    expect(isValidStrengthSet(set)).toBe(false)
  })

  it('CASE P5: strength metrics ignore invalid mobility records in same session', () => {
    const history = [
      session([
        {
          exercise: 'Barbell Squats',
          muscle: 'Quads',
          weight: 225,
          reps: 5,
        },
        {
          exercise: 'Toe Touches',
          muscle: 'Core',
          weight: 300,
          reps: 12,
        },
      ]),
    ]

    expect(sessionVolume(history[0])).toBe(1125)
    const prs = recentPRs(history)
    expect(prs.some((pr) => pr.exercise === 'Toe Touches')).toBe(false)
    expect(prs.some((pr) => pr.exercise === 'Barbell Squats')).toBe(true)
  })

  it('CASE P6: old malformed extreme load does not create a PR', () => {
    const history = [
      session([
        {
          exercise: 'Toe Touches',
          weight: 300,
          reps: 1,
        },
      ]),
      session([
        {
          exercise: 'Bench Press',
          weight: 135,
          reps: 8,
        },
      ]),
    ]

    expect(recentValidatedPRs(history).some((pr) => /Toe Touches/i.test(pr.exercise))).toBe(
      false,
    )
  })

  it('CASE P7: omits nonsense session volume PRs below threshold', () => {
    const history = [
      session([{ exercise: 'Bench Press', weight: 1, reps: 1 }]),
    ]

    expect(recentValidatedPRs(history).some((pr) => pr.type === 'Session Volume')).toBe(
      false,
    )
  })

  it('AVA win gate rejects invalid performance wins', () => {
    const state = {
      history: [
        session([
          {
            exercise: 'Toe Touches',
            weight: 300,
            reps: 10,
          },
        ]),
      ],
      readiness: { entries: [] },
      weeklySchedule: {},
      program: { nextWorkout: null, workouts: {} },
    }

    const briefing = buildAvaDailyBriefing(state, {
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(briefing.win).toBeUndefined()
  })
})
