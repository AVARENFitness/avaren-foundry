import { describe, expect, it } from 'vitest'
import { validateNutritionLabelResult } from './nutritionLabelValidation'
import { foodMeasureMultiplier, FOOD_MEASURE_UNIT, resolveFoodServingBasis } from './nutritionMeasurement'

const label = {
  kind: 'nutrition_label', sourceType: 'label_read', confidence: 'high',
  servingDescription: '2/3 cup (55g)', servingAmount: 55, servingUnit: 'g',
  calories: 210, protein: 7, carbs: 31, fat: 7, fiber: 3,
}

describe('Nutrition Facts photo validation and measured portions', () => {
  it('accepts complete per-serving label values', () => {
    expect(validateNutritionLabelResult(label)).toEqual({ ok: true })
  })

  it('scales printed-serving macros once for a 20g food-scale amount', () => {
    const basis = resolveFoodServingBasis(label)
    const multiplier = foodMeasureMultiplier({ amount: 20, unit: FOOD_MEASURE_UNIT.GRAM, servingBasis: basis })
    expect(multiplier).toBeCloseTo(20 / 55, 6)
    expect(label.calories * multiplier).toBeCloseTo(76.36, 1)
  })

  it('supports the same 55g label with an ounce measurement', () => {
    const basis = resolveFoodServingBasis(label)
    const multiplier = foodMeasureMultiplier({ amount: 1, unit: FOOD_MEASURE_UNIT.OUNCE, servingBasis: basis })
    expect(multiplier).toBeCloseTo(28.349523125 / 55, 5)
  })

  it('does not silently accept a missing serving size', () => {
    expect(validateNutritionLabelResult({ ...label, servingAmount: 0, servingUnit: 'unknown', servingDescription: '' }).ok).toBe(false)
  })

  it('rejects nonnumeric and implausible missing macronutrient data', () => {
    expect(validateNutritionLabelResult({ ...label, protein: null }).ok).toBe(false)
    expect(validateNutritionLabelResult({ ...label, fat: -1 }).ok).toBe(false)
  })

  it('rejects uncertain all-zero labels without fabricating nutrition', () => {
    expect(validateNutritionLabelResult({ ...label, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, confidence: 'low' }).ok).toBe(false)
  })

  it('does not block ordinary estimated meals', () => {
    expect(validateNutritionLabelResult({ kind: 'meal', calories: 340 })).toEqual({ ok: true })
  })
})
