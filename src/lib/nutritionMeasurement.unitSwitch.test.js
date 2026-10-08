import { describe, expect, it } from 'vitest'
import { FOOD_MEASURE_UNIT, weightAmountForUnitSwitch } from './nutritionMeasurement'

describe('food scale unit switching', () => {
  it('preserves a weighed portion on grams to ounces conversion', () => {
    const result = Number(weightAmountForUnitSwitch(59, FOOD_MEASURE_UNIT.GRAM, FOOD_MEASURE_UNIT.OUNCE, 100))
    expect(result).toBeCloseTo(2.081, 3)
  })

  it('preserves the original portion when switching ounces back to grams', () => {
    const ounces = weightAmountForUnitSwitch(16, 'g', 'oz', 1)
    const grams = weightAmountForUnitSwitch(ounces, 'oz', 'g', 59)
    expect(Number(grams)).toBeCloseTo(16, 2)
  })

  it('uses full serving default when switching from servings or counts', () => {
    expect(weightAmountForUnitSwitch('2', 'serving', 'g', 59)).toBe('59')
    expect(weightAmountForUnitSwitch('3', 'item', 'oz', 2)).toBe('2')
  })

  it('falls back to the default when the entered weight is invalid', () => {
    expect(weightAmountForUnitSwitch('', 'g', 'oz', 1.5)).toBe('1.5')
    expect(weightAmountForUnitSwitch(-3, 'g', 'oz', 1.5)).toBe('1.5')
  })
})
