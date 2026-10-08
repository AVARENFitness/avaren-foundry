import { describe, expect, it } from 'vitest'
import {
  groupNutritionFoodsByLoggedTime,
  nutritionFoodGroupTimeLabel,
  nutritionFoodGroupTotals,
  nutritionFoodLoggedTimeLabel,
  shouldGroupNutritionDay,
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

  it('keeps small days visually simple even when times differ', () => {
    const foods = [
      { id: '1', loggedAt: '2026-10-08T08:00:00.000Z' },
      { id: '2', loggedAt: '2026-10-08T18:00:00.000Z' },
    ]
    const groups = groupNutritionFoodsByLoggedTime(foods)

    expect(groups).toHaveLength(2)
    expect(shouldGroupNutritionDay(foods, groups)).toBe(false)
  })

  it('groups timestamp-less legacy entries together instead of inventing moments', () => {
    const groups = groupNutritionFoodsByLoggedTime([
      { id: 'legacy-1', name: 'Old food' },
      { id: 'legacy-2', name: 'Another old food' },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].foods).toHaveLength(2)
    expect(nutritionFoodGroupTimeLabel(groups[0])).toBe('Earlier log')
  })

  it('shows a real logged time without assigning a meal name', () => {
    const label = nutritionFoodLoggedTimeLabel({
      loggedAt: '2026-10-08T12:15:00.000Z',
    })
    expect(label).toBeTruthy()
    expect(label).not.toMatch(/breakfast|lunch|dinner/i)
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
