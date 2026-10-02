import { describe, expect, it } from 'vitest'
import {
  analyzeNutritionAdaptation,
  applyAdaptiveNutritionAdjustment,
} from './nutritionAdaptation'

const buildDays = ({
  calories = 2200,
  budget = 2200,
  firstWeekWeight = 180,
  secondWeekWeight = 178,
} = {}) =>
  Array.from({ length: 14 }, (_, index) => {
    const date = new Date('2026-09-01T12:00:00')
    date.setDate(date.getDate() + index)
    return {
      date: date.toISOString().slice(0, 10),
      calories,
      budget,
      weight:
        index % 3 === 0
          ? index < 7
            ? firstWeekWeight
            : secondWeekWeight
          : '',
      completeNutrition: true,
    }
  })

describe('nutrition adaptation', () => {
  it('waits for enough data before changing targets', () => {
    const result = analyzeNutritionAdaptation({
      goal: 'lose_fat',
      currentBaseCalories: 2200,
      days: buildDays().slice(0, 5),
    })

    expect(result.status).toBe('learning')
    expect(result.adjustmentCalories).toBe(0)
  })

  it('holds when intake adherence is too inconsistent', () => {
    const days = buildDays().map((day, index) => ({
      ...day,
      calories: index % 2 === 0 ? 1600 : 2900,
    }))

    const result = analyzeNutritionAdaptation({
      goal: 'lose_fat',
      currentBaseCalories: 2200,
      days,
    })

    expect(result.status).toBe('hold_for_adherence')
    expect(result.adjustmentCalories).toBe(0)
  })

  it('recommends a small reduction when fat loss is too slow', () => {
    const result = analyzeNutritionAdaptation({
      goal: 'lose_fat',
      currentBaseCalories: 2200,
      days: buildDays({
        firstWeekWeight: 180,
        secondWeekWeight: 179.8,
      }),
    })

    expect(result.status).toBe('recommend')
    expect(result.adjustmentCalories).toBe(-150)
    expect(result.proposedBaseCalories).toBe(2050)
  })

  it('recommends more calories when a muscle-gain trend is not rising', () => {
    const result = analyzeNutritionAdaptation({
      goal: 'build_muscle',
      currentBaseCalories: 2800,
      days: buildDays({
        calories: 2800,
        budget: 2800,
        firstWeekWeight: 180,
        secondWeekWeight: 180,
      }),
    })

    expect(result.status).toBe('recommend')
    expect(result.adjustmentCalories).toBe(150)
  })

  it('keeps targets unchanged when weight trend is on track', () => {
    const result = analyzeNutritionAdaptation({
      goal: 'lose_fat',
      currentBaseCalories: 2200,
      days: buildDays({
        firstWeekWeight: 180,
        secondWeekWeight: 178.8,
      }),
    })

    expect(result.status).toBe('on_track')
    expect(result.adjustmentCalories).toBe(0)
  })

  it('applies calorie changes while preserving protein and recalculating carbs/fat', () => {
    const goals = {
      calories: 2200,
      protein: 180,
      carbs: 225,
      fat: 65,
      inputs: { weightLb: 180 },
      macroStrategy: { fatShare: 0.25 },
    }

    const next = applyAdaptiveNutritionAdjustment(goals, {
      adjustmentCalories: -150,
      percentPerWeek: -0.1,
      adherence: 0.9,
    })

    expect(next.calories).toBe(2050)
    expect(next.protein).toBe(180)
    expect(next.carbs).toBeLessThan(goals.carbs)
    expect(next.source).toBe('ava_adaptive')
    expect(next.adaptation.history).toHaveLength(1)
  })
})
