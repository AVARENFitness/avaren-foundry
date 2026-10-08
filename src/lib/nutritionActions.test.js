describe('Reusable scanned meals', () => {
  it('logs a reusable meal without decrementing fake batch inventory', () => {
    const nutrition = {
      ...createNutritionState(),
      recipes: [
        {
          id: 'meal-1',
          name: 'Chicken bowl',
          reusableMeal: true,
          trackInventory: false,
          servings: 1,
          remainingServings: null,
          totals: {
            calories: 500,
            protein: 50,
            carbs: 45,
            fat: 12,
            fiber: 6,
          },
        },
      ],
    }

    const result = logRecipeToNutrition(
      nutrition,
      '2026-10-05',
      nutrition.recipes[0],
      1,
    )

    expect(result.entry).toMatchObject({
      source: 'recipe',
      name: 'Chicken bowl',
      calories: 500,
      protein: 50,
    })
    expect(result.nutrition.recipes[0].remainingServings).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  appendFatSecretFoodReference,
  hydrateFatSecretNutritionSnapshot,
  logRecipeToNutrition,
  needsFatSecretNutritionSnapshot,
  repeatLoggedFoodEntry,
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

  it('hydrates an older reference-only FatSecret entry for Home totals', () => {
    const legacy = {
      id: 'legacy-1',
      source: 'fatsecret',
      provider: 'fatsecret',
      fatSecret: {
        foodId: 'food-legacy',
        servingId: 'serving-legacy',
      },
      quantity: 2,
      loggedAt: '2026-10-03T12:00:00.000Z',
    }

    expect(needsFatSecretNutritionSnapshot(legacy)).toBe(true)

    const hydrated = hydrateFatSecretNutritionSnapshot(legacy, {
      name: 'Legendary Foods Protein Pastry',
      brand: 'Legendary Foods',
      servings: [
        {
          servingId: 'serving-legacy',
          description: '1 pastry',
          calories: 430,
          protein: 24,
          carbs: 44,
          fat: 16,
          fiber: 8,
        },
      ],
    })

    expect(hydrated).toMatchObject({
      name: 'Legendary Foods Protein Pastry',
      calories: 860,
      protein: 48,
      carbs: 88,
      fat: 32,
      fiber: 16,
    })
    expect(needsFatSecretNutritionSnapshot(hydrated)).toBe(false)

    expect(
      nutritionTotals({
        foods: [hydrated],
        waterOz: 0,
        weight: '',
      }),
    ).toMatchObject({
      calories: 860,
      protein: 48,
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


describe('Nutrition repeat logging', () => {
  it('repeats the exact logged portion without redoing serving math', () => {
    const nutrition = createNutritionState()
    const original = {
      id: 'old-entry',
      source: 'nutrition_label_scan',
      name: 'Chicken sausage balls',
      calories: 120,
      protein: 14,
      carbs: 4,
      fat: 5,
      fiber: 0,
      servings: 1 / 3,
      measurement: {
        amount: 2,
        unit: 'item',
        servingAmount: 6,
        servingUnit: 'item',
        itemLabel: 'balls',
      },
      loggedAt: '2026-10-07T12:00:00.000Z',
    }

    const result = repeatLoggedFoodEntry(
      nutrition,
      '2026-10-08',
      original,
    )

    expect(result.entry.id).not.toBe(original.id)
    expect(result.entry).toMatchObject({
      name: 'Chicken sausage balls',
      calories: 120,
      protein: 14,
      measurement: {
        amount: 2,
        unit: 'item',
        servingAmount: 6,
        servingUnit: 'item',
        itemLabel: 'balls',
      },
    })
    expect(result.nutrition.days['2026-10-08'].foods).toHaveLength(1)
  })

  it('preserves item labels on newly built entries', () => {
    const result = appendFatSecretFoodReference(
      createNutritionState(),
      '2026-10-08',
      {
        foodId: 'balls-food',
        servingId: 'balls-serving',
        quantity: 1 / 3,
        measurement: {
          amount: 2,
          unit: 'item',
          servingAmount: 6,
          servingUnit: 'item',
          itemLabel: 'balls',
        },
        servingSnapshot: {
          name: 'Chicken sausage balls',
          serving: '6 balls',
          calories: 360,
          protein: 42,
          carbs: 12,
          fat: 15,
          fiber: 0,
        },
      },
    )

    expect(result.entry.measurement.itemLabel).toBe('balls')
  })
})
