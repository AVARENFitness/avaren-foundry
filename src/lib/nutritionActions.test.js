import { describe, expect, it } from 'vitest'
import {
  appendFatSecretFoodReference,
} from './nutritionActions'
import {
  createNutritionState,
  nutritionTotals,
} from './nutrition'

describe('FatSecret nutrition snapshots', () => {
  it('stores scaled verified macros alongside provider ids for shared totals', () => {
    const nutrition = createNutritionState()
    const date = '2026-10-03'

    const result = appendFatSecretFoodReference(
      nutrition,
      date,
      {
        foodId: 'food-123',
        servingId: 'serving-wrap',
        quantity: 2,
        servingSnapshot: {
          name: 'Protein Wrap',
          brand: 'Example Brand',
          serving: '1 wrap',
          calories: 110,
          protein: 10,
          carbs: 18,
          fat: 3,
          fiber: 5,
        },
      },
    )

    const [entry] = result.nutrition.days[date].foods

    expect(entry).toMatchObject({
      source: 'fatsecret',
      quantity: 2,
      name: 'Protein Wrap',
      serving: '1 wrap',
      calories: 220,
      protein: 20,
      carbs: 36,
      fat: 6,
      fiber: 10,
      fatSecret: {
        foodId: 'food-123',
        servingId: 'serving-wrap',
      },
    })

    expect(nutritionTotals(result.nutrition.days[date])).toMatchObject({
      calories: 220,
      protein: 20,
      carbs: 36,
      fat: 6,
      fiber: 10,
    })
  })

  it('keeps reference-only compatibility when no snapshot is supplied', () => {
    const nutrition = createNutritionState()

    const result = appendFatSecretFoodReference(
      nutrition,
      '2026-10-03',
      {
        foodId: 'legacy-food',
        servingId: 'legacy-serving',
        quantity: 1.5,
      },
    )

    expect(result.entry).toMatchObject({
      source: 'fatsecret',
      quantity: 1.5,
      fatSecret: {
        foodId: 'legacy-food',
        servingId: 'legacy-serving',
      },
    })
    expect(result.entry.calories).toBeUndefined()
  })
})
