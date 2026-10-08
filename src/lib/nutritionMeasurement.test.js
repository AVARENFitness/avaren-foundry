import { describe, expect, it } from 'vitest'
import {
  FOOD_MEASURE_UNIT,
  GRAMS_PER_OUNCE,
  convertFoodMeasureAmount,
  foodMeasureMultiplier,
  parseFoodCountFromContext,
  parseFoodServingCount,
  parseFoodServingMeasurement,
  resolveFoodServingBasis,
  resolveFoodServingCountBasis,
  servingFractionDisplay,
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

  it('parses count-based servings such as 6 sausage balls', () => {
    expect(parseFoodServingCount('6 sausage-balls (85 g)')).toMatchObject({
      amount: 6,
      unit: FOOD_MEASURE_UNIT.ITEM,
      label: 'sausage-balls',
    })
  })

  it('scales 2 items out of a 6-item serving to one third', () => {
    const basis = resolveFoodServingCountBasis({
      description: '6 balls (85 g)',
    })
    expect(
      foodMeasureMultiplier({
        amount: 2,
        unit: FOOD_MEASURE_UNIT.ITEM,
        servingBasis: basis,
      }),
    ).toBeCloseTo(2 / 6, 6)
    expect(servingFractionDisplay(2 / 6)).toBe('⅓ serving')
  })

  it('understands natural context like "I had 2" against a count serving', () => {
    const basis = resolveFoodServingCountBasis({
      servingDescription: '6 balls (85 g)',
    })
    expect(parseFoodCountFromContext('I had 2', basis)).toMatchObject({
      amount: 2,
      unit: FOOD_MEASURE_UNIT.ITEM,
      multiplier: 2 / 6,
      source: 'user_context',
    })
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
