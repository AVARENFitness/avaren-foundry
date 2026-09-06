import { describe, expect, it } from 'vitest'
import { evaluateSetPr } from './setPrEvaluation'
import {
  estimateOneRepMaxFromPerformance,
  estimatedOneRepMax,
  resolveExerciseStrength,
  shouldPromptForRpe,
} from './strengthEstimate'

const session = (id, date, sets) => ({
  id,
  date,
  finishedAt: `${date}T18:00:00.000Z`,
  name: `Session ${id}`,
  sets,
})

describe('strengthEstimate formula', () => {
  it('uses capped Epley-style estimate for credible rep ranges', () => {
    expect(estimatedOneRepMax(315, 1)).toBe(315)
    expect(estimatedOneRepMax(295, 3)).toBe(324.5)
    expect(estimatedOneRepMax(275, 6)).toBe(330)
    expect(estimatedOneRepMax(225, 10)).toBe(300)
  })

  it('rejects extremely high-rep sets', () => {
    expect(estimatedOneRepMax(135, 20)).toBe(0)
    expect(estimateOneRepMaxFromPerformance({ weight: 95, reps: 15 })).toBe(0)
  })

  it('applies RPE conservatively via RIR', () => {
    const atTen = estimateOneRepMaxFromPerformance({
      weight: 315,
      reps: 1,
      rpe: 10,
    })
    const atEight = estimateOneRepMaxFromPerformance({
      weight: 315,
      reps: 1,
      rpe: 8,
    })
    expect(atTen).toBe(315)
    expect(atEight).toBeGreaterThan(atTen)
    // 315×1 @ RPE 8 → +2 RIR → effective 3 reps → 315 × (1 + 3/30)
    expect(atEight).toBe(346.5)
  })

  it('ignores invalid RPE without breaking', () => {
    expect(
      estimateOneRepMaxFromPerformance({ weight: 315, reps: 1, rpe: 3 }),
    ).toBe(315)
    expect(
      estimateOneRepMaxFromPerformance({ weight: 315, reps: 1, rpe: null }),
    ).toBe(315)
  })
})

describe('resolveExerciseStrength historical protection', () => {
  it('does not lower proven best or current estimate after a lighter volume session', () => {
    const history = [
      session('a', '2026-01-01', [
        {
          exercise: 'Bench Press',
          weight: 315,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
      ]),
      session('b', '2026-01-08', [
        {
          exercise: 'Bench Press',
          weight: 275,
          reps: 5,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]

    const strength = resolveExerciseStrength(history, 'Bench Press')
    expect(strength.provenBest).toBeGreaterThanOrEqual(315)
    expect(strength.provenSingleBest).toBe(315)
    expect(strength.currentEstimate).toBeGreaterThanOrEqual(315)
  })

  it('does not lower current estimate from a deload-style session', () => {
    const history = [
      session('a', '2026-01-01', [
        {
          exercise: 'Squat',
          weight: 405,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
      ]),
      session('b', '2026-01-08', [
        {
          exercise: 'Squat',
          weight: 225,
          reps: 8,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]

    const before = resolveExerciseStrength([history[0]], 'Squat')
    const after = resolveExerciseStrength(history, 'Squat')
    expect(after.provenBest).toBe(before.provenBest)
    expect(after.currentEstimate).toBe(before.currentEstimate)
  })

  it('raises promptly on a heavier successful single', () => {
    const history = [
      session('a', '2026-01-01', [
        {
          exercise: 'Bench Press',
          weight: 315,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
      ]),
      session('b', '2026-01-08', [
        {
          exercise: 'Bench Press',
          weight: 320,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]

    const strength = resolveExerciseStrength(history, 'Bench Press')
    expect(strength.currentEstimate).toBe(320)
    expect(strength.provenBest).toBe(320)
    expect(strength.provenSingleBest).toBe(320)
  })

  it('raises on credible multi-rep performance above prior estimate', () => {
    const history = [
      session('a', '2026-01-01', [
        {
          exercise: 'Bench Press',
          weight: 275,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
      ]),
      session('b', '2026-01-08', [
        {
          exercise: 'Bench Press',
          weight: 295,
          reps: 5,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]

    const strength = resolveExerciseStrength(history, 'Bench Press')
    expect(strength.currentEstimate).toBeGreaterThan(275)
    expect(strength.currentEstimate).toBe(
      estimateOneRepMaxFromPerformance({ weight: 295, reps: 5 }),
    )
  })

  it('preserves proven 315 while RPE 8 estimates higher than RPE 10', () => {
    const base = [
      session('a', '2026-01-01', [
        {
          exercise: 'Bench Press',
          weight: 315,
          reps: 1,
          rpe: 10,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]
    const withReserve = [
      session('a', '2026-01-01', [
        {
          exercise: 'Bench Press',
          weight: 315,
          reps: 1,
          rpe: 8,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]

    const atTen = resolveExerciseStrength(base, 'Bench Press')
    const atEight = resolveExerciseStrength(withReserve, 'Bench Press')
    expect(atTen.provenSingleBest).toBe(315)
    expect(atEight.provenSingleBest).toBe(315)
    expect(atEight.currentEstimate).toBeGreaterThan(atTen.currentEstimate)
  })

  it('requires multiple lower high-effort sessions before gradual decline', () => {
    const history = [
      session('a', '2026-01-01', [
        {
          exercise: 'Deadlift',
          weight: 500,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
      ]),
      session('b', '2026-01-08', [
        {
          exercise: 'Deadlift',
          weight: 405,
          reps: 3,
          loadType: 'external',
          type: 'Working',
        },
      ]),
      session('c', '2026-01-15', [
        {
          exercise: 'Deadlift',
          weight: 410,
          reps: 2,
          loadType: 'external',
          type: 'Working',
        },
      ]),
      session('d', '2026-01-22', [
        {
          exercise: 'Deadlift',
          weight: 400,
          reps: 3,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]

    const afterOne = resolveExerciseStrength(history.slice(0, 2), 'Deadlift')
    expect(afterOne.currentEstimate).toBe(500)
    expect(afterOne.provenBest).toBe(500)

    const afterThree = resolveExerciseStrength(history, 'Deadlift')
    expect(afterThree.provenBest).toBe(500)
    expect(afterThree.provenSingleBest).toBe(500)
    expect(afterThree.currentEstimate).toBeLessThan(500)
    expect(afterThree.currentEstimate).toBeGreaterThan(430)
  })

  it('does not mix Bench Press with Incline Bench Press', () => {
    const history = [
      session('a', '2026-01-01', [
        {
          exercise: 'Barbell Bench Press',
          weight: 315,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
      ]),
      session('b', '2026-01-08', [
        {
          exercise: 'Incline Bench Press',
          weight: 225,
          reps: 5,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]

    const bench = resolveExerciseStrength(history, 'Barbell Bench Press')
    const incline = resolveExerciseStrength(history, 'Incline Bench Press')
    expect(bench.currentEstimate).toBe(315)
    expect(incline.currentEstimate).toBe(
      estimateOneRepMaxFromPerformance({ weight: 225, reps: 5 }),
    )
  })

  it('uses per-side unilateral performance rather than doubled reps', () => {
    const history = [
      session('a', '2026-01-01', [
        {
          exercise: 'Single-Arm Dumbbell Row',
          weight: 80,
          reps: 10,
          sidesMode: 'shared',
          unilateral: true,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]

    const strength = resolveExerciseStrength(
      history,
      'Single-Arm Dumbbell Row',
    )
    // Shared 80×10/side → estimate from 80×10, not 80×20.
    expect(strength.currentEstimate).toBe(
      estimateOneRepMaxFromPerformance({ weight: 80, reps: 10 }),
    )
  })

  it('does not invent bodyweight or assisted 1RM estimates', () => {
    const history = [
      session('a', '2026-01-01', [
        {
          exercise: 'Pull-Up',
          weight: 0,
          reps: 12,
          loadType: 'bodyweight',
          type: 'Working',
        },
        {
          exercise: 'Assisted Pull-Up',
          weight: 40,
          reps: 8,
          loadType: 'assisted',
          type: 'Working',
        },
      ]),
    ]

    expect(resolveExerciseStrength(history, 'Pull-Up').currentEstimate).toBe(0)
    expect(
      resolveExerciseStrength(history, 'Assisted Pull-Up').currentEstimate,
    ).toBe(0)
  })

  it('recomputes after edited historical sets', () => {
    const original = [
      session('a', '2026-01-01', [
        {
          exercise: 'Bench Press',
          weight: 275,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]
    const edited = [
      session('a', '2026-01-01', [
        {
          exercise: 'Bench Press',
          weight: 315,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
      ]),
    ]

    expect(resolveExerciseStrength(original, 'Bench Press').currentEstimate).toBe(
      275,
    )
    expect(resolveExerciseStrength(edited, 'Bench Press').currentEstimate).toBe(
      315,
    )
  })
})

describe('shouldPromptForRpe selective prompting', () => {
  const history = [
    session('a', '2026-01-01', [
      {
        exercise: 'Bench Press',
        weight: 315,
        reps: 1,
        loadType: 'external',
        type: 'Working',
      },
    ]),
  ]

  it('prompts for a heavy informative set near established strength', () => {
    expect(
      shouldPromptForRpe({
        set: {
          exercise: 'Bench Press',
          weight: 315,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
        exerciseName: 'Bench Press',
        history,
      }),
    ).toBe(true)
  })

  it('does not prompt for warm-ups', () => {
    expect(
      shouldPromptForRpe({
        set: {
          exercise: 'Bench Press',
          weight: 135,
          reps: 8,
          loadType: 'external',
          type: 'Warm-up',
        },
        exerciseName: 'Bench Press',
        history,
      }),
    ).toBe(false)
  })

  it('does not prompt for ordinary moderate sets', () => {
    expect(
      shouldPromptForRpe({
        set: {
          exercise: 'Bench Press',
          weight: 185,
          reps: 8,
          loadType: 'external',
          type: 'Working',
        },
        exerciseName: 'Bench Press',
        history,
      }),
    ).toBe(false)
  })

  it('does not re-prompt after alreadyPromptedForExercise', () => {
    expect(
      shouldPromptForRpe({
        set: {
          exercise: 'Bench Press',
          weight: 315,
          reps: 1,
          loadType: 'external',
          type: 'Working',
        },
        exerciseName: 'Bench Press',
        history,
        alreadyPromptedForExercise: true,
      }),
    ).toBe(false)
  })
})

describe('set PR regression (#6)', () => {
  it('still evaluates weight/rep PRs without estimated 1RM', () => {
    const evaluation = evaluateSetPr({
      set: { weight: 320, reps: 1, loadType: 'external' },
      loadType: 'external',
      historicalSets: [{ weight: 315, reps: 1, loadType: 'external' }],
      earlierSets: [],
    })
    expect(evaluation.isWeightPr).toBe(true)
    expect(evaluation.isPr).toBe(true)
  })
})
