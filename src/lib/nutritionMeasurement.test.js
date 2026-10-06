import { describe, expect, it } from 'vitest'
import {
  FOOD_MEASURE_UNIT,
  GRAMS_PER_OUNCE,
  convertFoodMeasureAmount,
  foodMeasureMultiplier,
  parseFoodServingMeasurement,
  resolveFoodServingBasis,
  resolveNutritionLabelConsumptionMeasurement,
} from './nutritionMeasurement'

describe('nutritionMeasurement', () => {
  it('parses gram serving bases from nutrition label text', () => {
    expect(parseFoodServingMeasurement('2/3 cup (150g)')).toEqual({
      amount: 150,
      unit: FOOD_MEASURE_UNIT.GRAM,
    })
  })

  it('prefers structured FatSecret metric serving data', () => {
    expect(
      resolveFoodServingBasis({
        metricAmount: 170,
        metricUnit: 'g',
        description: '1 container',
      }),
    ).toMatchObject({
      amount: 170,
      unit: FOOD_MEASURE_UNIT.GRAM,
      source: 'structured',
    })
  })

  it('scales a 150g label serving to 185g eaten', () => {
    expect(
      foodMeasureMultiplier({
        amount: 185,
        unit: 'g',
        servingBasis: { amount: 150, unit: 'g' },
      }),
    ).toBeCloseTo(185 / 150, 6)
  })

  it('supports ounce entries against a gram serving basis', () => {
    const multiplier = foodMeasureMultiplier({
      amount: 6.5,
      unit: 'oz',
      servingBasis: { amount: 100, unit: 'g' },
    })

    expect(multiplier).toBeCloseTo((6.5 * GRAMS_PER_OUNCE) / 100, 6)
  })

  it('converts grams and ounces both ways', () => {
    expect(convertFoodMeasureAmount(GRAMS_PER_OUNCE, 'g', 'oz')).toBeCloseTo(1, 6)
    expect(convertFoodMeasureAmount(1, 'oz', 'g')).toBeCloseTo(GRAMS_PER_OUNCE, 6)
  })

  it('uses an exact user-entered label weight instead of one full serving', () => {
    const measurement = resolveNutritionLabelConsumptionMeasurement({
      servingBasis: { amount: 59, unit: 'g' },
      context: 'I ate 16g',
    })

    expect(measurement).toMatchObject({
      amount: 16,
      unit: FOOD_MEASURE_UNIT.GRAM,
      source: 'user_context',
    })
    expect(measurement.multiplier).toBeCloseTo(16 / 59, 6)
  })

  it('defaults a measurable label to its printed weight when no eaten weight was supplied', () => {
    expect(
      resolveNutritionLabelConsumptionMeasurement({
        servingBasis: { amount: 59, unit: 'g' },
        context: '',
      }),
    ).toEqual({
      amount: 59,
      unit: FOOD_MEASURE_UNIT.GRAM,
      multiplier: 1,
      source: 'label_serving',
    })
  })
})
