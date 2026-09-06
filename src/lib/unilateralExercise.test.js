import { describe, expect, it } from 'vitest'
import {
  collapseToSharedIfEqual,
  expandToDifferentSides,
  expandUnilateralPerformances,
  isUnilateralExercise,
  resolveSidesMode,
  sessionTotalReps,
  setTotalReps,
  SIDES_MODE,
  sidesValuesEqual,
} from './unilateralExercise'
import { formatCompletedSetDisplay, LOAD_TYPES } from './exerciseLoad'
import { formatBestSetDisplay as formatGlanceBest } from './exercisePreviousContext'
import { setLoadVolume } from './workoutMetrics'
import { evaluateSetPr } from './setPrEvaluation'

describe('unilateralExercise detection', () => {
  it('classifies clear unilateral names', () => {
    expect(isUnilateralExercise('Single-Arm Dumbbell Row')).toBe(true)
    expect(isUnilateralExercise('Single Arm Row')).toBe(true)
    expect(isUnilateralExercise('Single-Leg Romanian Deadlift')).toBe(true)
    expect(isUnilateralExercise('Single Leg RDL')).toBe(true)
    expect(isUnilateralExercise('One-Arm Cable Row')).toBe(true)
    expect(isUnilateralExercise('Unilateral Farmer Carry')).toBe(true)
  })

  it('does not falsely classify bilateral or generic dumbbell work', () => {
    expect(isUnilateralExercise('Bench Press')).toBe(false)
    expect(isUnilateralExercise('Barbell Bench Press')).toBe(false)
    expect(isUnilateralExercise('Dumbbell Bench Press')).toBe(false)
    expect(isUnilateralExercise('Dumbbell Row')).toBe(false)
    expect(isUnilateralExercise('Chest-Supported Dumbbell Row')).toBe(false)
  })

  it('honors explicit unilateral metadata', () => {
    expect(
      isUnilateralExercise({ name: 'Custom Press', unilateral: true }),
    ).toBe(true)
  })
})

describe('unilateral set totals and sides', () => {
  it('treats shared 50×10 as both sides for reps and volume', () => {
    const set = {
      exercise: 'Single-Arm Dumbbell Row',
      loadType: LOAD_TYPES.EXTERNAL,
      weight: 50,
      reps: 10,
      sidesMode: SIDES_MODE.SHARED,
    }

    expect(setTotalReps(set)).toBe(20)
    expect(setLoadVolume(set)).toBe(1000)
    expect(expandUnilateralPerformances(set)).toEqual([
      { side: 'shared', weight: 50, reps: 10 },
    ])
    expect(formatCompletedSetDisplay(set)).toBe('50 lb × 10/side')
  })

  it('expands shared values into different sides and preserves unequal data', () => {
    const shared = {
      exercise: 'Single-Arm Dumbbell Row',
      weight: 50,
      reps: 10,
    }
    const expanded = expandToDifferentSides(shared)
    expect(expanded.sidesMode).toBe(SIDES_MODE.DIFFERENT)
    expect(expanded.left).toEqual({ weight: 50, reps: 10 })
    expect(expanded.right).toEqual({ weight: 50, reps: 10 })

    const unequal = {
      ...expanded,
      right: { weight: 45, reps: 8 },
    }
    expect(sidesValuesEqual(unequal)).toBe(false)
    expect(collapseToSharedIfEqual(unequal).sidesMode).toBe(
      SIDES_MODE.DIFFERENT,
    )
    expect(collapseToSharedIfEqual(unequal).right).toEqual({
      weight: 45,
      reps: 8,
    })
  })

  it('sums different-side reps and volume', () => {
    const set = {
      exercise: 'Single-Arm Dumbbell Row',
      loadType: LOAD_TYPES.EXTERNAL,
      sidesMode: SIDES_MODE.DIFFERENT,
      weight: 50,
      reps: 10,
      left: { weight: 50, reps: 10 },
      right: { weight: 45, reps: 8 },
    }

    expect(setTotalReps(set)).toBe(18)
    expect(setLoadVolume(set)).toBe(860)
    expect(formatCompletedSetDisplay(set)).toBe(
      'L 50 lb × 10 · R 45 lb × 8',
    )
    expect(sessionTotalReps({ sets: [set] })).toBe(18)
  })

  it('does not alter bilateral volume math', () => {
    const set = {
      exercise: 'Bench Press',
      loadType: LOAD_TYPES.EXTERNAL,
      weight: 135,
      reps: 8,
    }
    expect(isUnilateralExercise(set.exercise)).toBe(false)
    expect(resolveSidesMode(set)).toBeNull()
    expect(setTotalReps(set)).toBe(8)
    expect(setLoadVolume(set)).toBe(1080)
    expect(formatCompletedSetDisplay(set)).toBe('135 × 8')
  })

  it('formats shared unilateral best glance with /side', () => {
    const best = {
      exercise: 'Single-Leg Romanian Deadlift',
      loadType: LOAD_TYPES.EXTERNAL,
      weight: 70,
      reps: 8,
      sidesMode: SIDES_MODE.SHARED,
    }
    expect(formatGlanceBest(best)).toBe('70 lb × 8/side')
  })
})

describe('set PR evaluation', () => {
  const history = [
    {
      exercise: 'Bench Press',
      loadType: LOAD_TYPES.EXTERNAL,
      weight: 50,
      reps: 10,
    },
  ]

  it('awards weight PR and rep-at-weight PR without e1rm', () => {
    expect(
      evaluateSetPr({
        set: { exercise: 'Bench Press', weight: 55, reps: 8, loadType: LOAD_TYPES.EXTERNAL },
        loadType: LOAD_TYPES.EXTERNAL,
        historicalSets: history,
      }).isWeightPr,
    ).toBe(true)

    expect(
      evaluateSetPr({
        set: { exercise: 'Bench Press', weight: 50, reps: 12, loadType: LOAD_TYPES.EXTERNAL },
        loadType: LOAD_TYPES.EXTERNAL,
        historicalSets: history,
      }).isRepPr,
    ).toBe(true)

    expect(
      evaluateSetPr({
        set: { exercise: 'Bench Press', weight: 50, reps: 9, loadType: LOAD_TYPES.EXTERNAL },
        loadType: LOAD_TYPES.EXTERNAL,
        historicalSets: history,
      }).isPr,
    ).toBe(false)
  })

  it('does not use doubled unilateral totals for PR comparison', () => {
    const unilateralHistory = [
      {
        exercise: 'Single-Arm Dumbbell Row',
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 50,
        reps: 10,
        sidesMode: SIDES_MODE.SHARED,
      },
    ]

    // 50×10/side again is not a PR even though total reps are 20.
    expect(
      evaluateSetPr({
        set: {
          exercise: 'Single-Arm Dumbbell Row',
          loadType: LOAD_TYPES.EXTERNAL,
          weight: 50,
          reps: 10,
          sidesMode: SIDES_MODE.SHARED,
        },
        loadType: LOAD_TYPES.EXTERNAL,
        historicalSets: unilateralHistory,
      }).isPr,
    ).toBe(false)

    expect(
      evaluateSetPr({
        set: {
          exercise: 'Single-Arm Dumbbell Row',
          loadType: LOAD_TYPES.EXTERNAL,
          weight: 50,
          reps: 12,
          sidesMode: SIDES_MODE.SHARED,
        },
        loadType: LOAD_TYPES.EXTERNAL,
        historicalSets: unilateralHistory,
      }).isRepPr,
    ).toBe(true)
  })

  it('only earlier genuine improvements become additional PRs', () => {
    const historicalSets = [
      {
        exercise: 'Bench Press',
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 50,
        reps: 10,
      },
    ]

    const set2 = {
      exercise: 'Bench Press',
      loadType: LOAD_TYPES.EXTERNAL,
      weight: 55,
      reps: 8,
    }
    const set3 = {
      exercise: 'Bench Press',
      loadType: LOAD_TYPES.EXTERNAL,
      weight: 55,
      reps: 7,
    }
    const set4 = {
      exercise: 'Bench Press',
      loadType: LOAD_TYPES.EXTERNAL,
      weight: 55,
      reps: 9,
    }

    expect(
      evaluateSetPr({
        set: set2,
        loadType: LOAD_TYPES.EXTERNAL,
        historicalSets,
        earlierSets: [],
      }).isPr,
    ).toBe(true)

    expect(
      evaluateSetPr({
        set: set3,
        loadType: LOAD_TYPES.EXTERNAL,
        historicalSets,
        earlierSets: [set2],
      }).isPr,
    ).toBe(false)

    expect(
      evaluateSetPr({
        set: set4,
        loadType: LOAD_TYPES.EXTERNAL,
        historicalSets,
        earlierSets: [set2, set3],
      }).isRepPr,
    ).toBe(true)
  })

  it('does not award a whole-set PR from a weaker different side alone', () => {
    const historicalSets = [
      {
        exercise: 'Single-Arm Dumbbell Row',
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 50,
        reps: 10,
        sidesMode: SIDES_MODE.SHARED,
      },
    ]

    const evaluation = evaluateSetPr({
      set: {
        exercise: 'Single-Arm Dumbbell Row',
        loadType: LOAD_TYPES.EXTERNAL,
        sidesMode: SIDES_MODE.DIFFERENT,
        left: { weight: 50, reps: 10 },
        right: { weight: 45, reps: 8 },
      },
      loadType: LOAD_TYPES.EXTERNAL,
      historicalSets,
    })

    expect(evaluation.isPr).toBe(false)
  })
})
