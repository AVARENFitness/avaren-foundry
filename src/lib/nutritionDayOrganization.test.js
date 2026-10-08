import { describe, expect, it } from 'vitest'
import {
  groupNutritionFoodsByLoggedTime,
  nutritionFoodGroupTimeLabel,
  nutritionFoodGroupTotals,
} from './nutritionDayOrganization'

describe('nutrition day organization', () => {
  it('clusters foods logged close together without inventing meal names', () => {
    const groups = groupNutritionFoodsByLoggedTime([
      { id: '1', name: 'Chicken', calories: 200, protein: 35, loggedAt: '2026-10-08T12:00:00.000Z' },
      { id: '2', name: 'Rice', calories: 180, protein: 4, loggedAt: '2026-10-08T12:12:00.000Z' },
      { id: '3', name: 'Yogurt', calories: 120, protein: 18, loggedAt: '2026-10-08T15:30:00.000Z' },
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].foods.map((food) => food.name)).toEqual(['Chicken', 'Rice'])
    expect(groups[1].foods.map((food) => food.name)).toEqual(['Yogurt'])
  })

  it('summarizes each eating moment without changing its foods', () => {
    const group = {
      startedAt: '2026-10-08T12:00:00.000Z',
      foods: [
        { calories: 200, protein: 35, carbs: 0, fat: 6 },
        { calories: 180, protein: 4, carbs: 40, fat: 1 },
      ],
    }

    expect(nutritionFoodGroupTotals(group)).toEqual({
      calories: 380,
      protein: 39,
      carbs: 40,
      fat: 7,
    })
    expect(nutritionFoodGroupTimeLabel(group)).not.toMatch(/breakfast|lunch|dinner/i)
  })
})
