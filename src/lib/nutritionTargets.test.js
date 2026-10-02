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
    expect(result.calculationVersion).toBe('mifflin-st-jeor-v3-goal-training-aware')
    expect(result.macroStrategy.goalLabel).toBe('Maintenance')
    expect(result.macroStrategy.proteinGPerKg).toBe(1.8)
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


  it('keeps workout frequency out of the base calorie target', () => {
    const shared = {
      goal: 'maintain',
      age: 30,
      sexForEnergyEstimation: 'male',
      heightIn: 70,
      weightLb: 180,
      activityLevel: 'moderately_active',
    }

    const noTraining = calculateNutritionTargets({
      ...shared,
      strengthSessionsPerWeek: 0,
      cardioSessionsPerWeek: 0,
    })
    const frequentTraining = calculateNutritionTargets({
      ...shared,
      strengthSessionsPerWeek: 6,
      cardioSessionsPerWeek: 4,
    })

    expect(frequentTraining.calories).toBe(noTraining.calories)
    expect(frequentTraining.protein).toBe(noTraining.protein)
    expect(frequentTraining.carbs).toBeGreaterThan(noTraining.carbs)
    expect(frequentTraining.fat).toBeLessThan(noTraining.fat)
  })


  it('changes macro emphasis by goal rather than using one universal split', () => {
    const shared = {
      age: 30,
      sexForEnergyEstimation: 'male',
      heightIn: 70,
      weightLb: 180,
      activityLevel: 'moderately_active',
      strengthSessionsPerWeek: 4,
      cardioSessionsPerWeek: 1,
    }

    const loss = calculateNutritionTargets({ ...shared, goal: 'lose_fat' })
    const build = calculateNutritionTargets({ ...shared, goal: 'build_muscle' })
    const performance = calculateNutritionTargets({ ...shared, goal: 'performance' })

    expect(loss.protein).toBeGreaterThan(build.protein)
    expect(build.calories).toBeGreaterThan(performance.calories)
    expect(performance.carbs).toBeGreaterThan(loss.carbs)
    expect(loss.macroStrategy.goalLabel).toBe('Fat loss')
    expect(build.macroStrategy.goalLabel).toBe('Muscle gain')
  })

  it('rejects incomplete inputs instead of inventing a target', () => {
    expect(() => calculateNutritionTargets({ goal: 'maintain' })).toThrow()
  })
})
