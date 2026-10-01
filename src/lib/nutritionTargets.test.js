import { describe, expect, it } from 'vitest'
import { calculateNutritionTargets } from './nutritionTargets'

describe('calculateNutritionTargets', () => {
  it('creates a realistic starting target from user inputs', () => {
    const result = calculateNutritionTargets({
      goal: 'maintain',
      age: 30,
      sexForEnergyEstimation: 'male',
      heightIn: 70,
      weightLb: 180,
      activityLevel: 'moderately_active',
      strengthSessionsPerWeek: 4,
      cardioSessionsPerWeek: 1,
    })

    expect(result.configured).toBe(true)
    expect(result.source).toBe('ava_estimated')
    expect(result.calories).toBeGreaterThan(2000)
    expect(result.protein).toBeGreaterThan(100)
    expect(result.carbs).toBeGreaterThan(0)
    expect(result.fat).toBeGreaterThan(0)
    expect(result.calculationVersion).toBe('mifflin-st-jeor-v1')
  })

  it('uses lower calories for a fat-loss goal than maintenance', () => {
    const shared = {
      age: 30,
      sexForEnergyEstimation: 'female',
      heightIn: 65,
      weightLb: 150,
      activityLevel: 'moderately_active',
    }

    const maintain = calculateNutritionTargets({ ...shared, goal: 'maintain' })
    const lose = calculateNutritionTargets({ ...shared, goal: 'lose_fat' })

    expect(lose.calories).toBeLessThan(maintain.calories)
    expect(lose.protein).toBeGreaterThanOrEqual(maintain.protein)
  })

  it('rejects incomplete inputs instead of inventing a target', () => {
    expect(() => calculateNutritionTargets({ goal: 'maintain' })).toThrow()
  })
})
