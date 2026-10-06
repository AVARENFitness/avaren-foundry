import { describe, expect, it } from 'vitest'
import {
  applyReusableMealPreviewToRecipe,
  buildReusableMealAdjustments,
  buildReusableMealIngredientFromFood,
  buildReusableMealRecipe,
  calculateReusableMealTotals,
} from './reusableMealRecipes'

describe('reusableMealRecipes', () => {
  it('builds a one-serving reusable meal from AVA scan components', () => {
    const recipe = buildReusableMealRecipe({
      name: 'Chicken rice bowl',
      context: '6 oz chicken, 150 g rice',
      components: [
        {
          name: 'Chicken',
          amount: '6 oz',
          calories: 280,
          protein: 52,
          carbs: 0,
          fat: 6,
          basis: 'user_provided',
        },
        {
          name: 'Rice',
          amount: '150 g',
          calories: 195,
          protein: 4,
          carbs: 42,
          fat: 1,
          basis: 'user_provided',
        },
      ],
    })

    expect(recipe).toMatchObject({
      name: 'Chicken rice bowl',
      source: 'ava_scan',
      reusableMeal: true,
      trackInventory: false,
      servings: 1,
      remainingServings: null,
      context: '6 oz chicken, 150 g rice',
    })
    expect(recipe.totals).toMatchObject({
      calories: 475,
      protein: 56,
      carbs: 42,
      fat: 7,
    })
    expect(recipe.ingredients[0]).toMatchObject({
      baseAmount: 6,
      baseUnit: 'oz',
    })
    expect(recipe.ingredients[1]).toMatchObject({
      baseAmount: 150,
      baseUnit: 'g',
    })
  })

  it('rescales measurable ingredients when today’s amounts change', () => {
    const recipe = buildReusableMealRecipe({
      name: 'Bowl',
      components: [
        {
          name: 'Chicken',
          amount: '6 oz',
          calories: 300,
          protein: 50,
          carbs: 0,
          fat: 8,
        },
        {
          name: 'Rice',
          amount: '150 g',
          calories: 200,
          protein: 4,
          carbs: 44,
          fat: 1,
        },
      ],
    })

    const adjustments = buildReusableMealAdjustments(recipe).map((item) =>
      item.name === 'Rice' ? { ...item, amount: '180', unit: 'g' } : item,
    )
    const result = calculateReusableMealTotals(recipe, adjustments)

    expect(result.ingredients.find((item) => item.name === 'Rice')).toMatchObject({
      adjustedAmount: '180 g',
      calories: 240,
      carbs: 52.8,
    })
    expect(result.totals.calories).toBe(540)
  })


  it('adds a searched food as an editable reusable-meal ingredient', () => {
    const ingredient = buildReusableMealIngredientFromFood({
      name: 'Greek yogurt',
      serving: '170 g',
      calories: 100,
      protein: 18,
      carbs: 6,
      fat: 0,
      fiber: 0,
    })

    expect(ingredient).toMatchObject({
      name: 'Greek yogurt',
      baseAmount: 170,
      baseUnit: 'g',
      calories: 100,
      protein: 18,
    })
  })

  it('can persist an adjusted ingredient list as the new saved default', () => {
    const recipe = buildReusableMealRecipe({
      name: 'Chicken bowl',
      components: [
        {
          name: 'Chicken',
          amount: '6 oz',
          calories: 300,
          protein: 50,
          carbs: 0,
          fat: 8,
        },
        {
          name: 'Rice',
          amount: '150 g',
          calories: 200,
          protein: 4,
          carbs: 44,
          fat: 1,
        },
      ],
    })

    const cheese = buildReusableMealIngredientFromFood({
      name: 'Cheese',
      serving: '28 g',
      calories: 110,
      protein: 7,
      carbs: 1,
      fat: 9,
    })

    const workingRecipe = {
      ...recipe,
      ingredients: [recipe.ingredients[0], cheese],
    }
    const adjustments = buildReusableMealAdjustments(workingRecipe).map((item) =>
      item.name === 'Chicken'
        ? { ...item, amount: '5', unit: 'oz' }
        : item,
    )
    const preview = calculateReusableMealTotals(workingRecipe, adjustments)
    const updated = applyReusableMealPreviewToRecipe(
      workingRecipe,
      preview,
    )

    expect(updated.ingredients.map((item) => item.name)).toEqual([
      'Chicken',
      'Cheese',
    ])
    expect(updated.ingredients[0]).toMatchObject({
      amount: '5 oz',
      baseAmount: 5,
      baseUnit: 'oz',
    })
    expect(updated.ingredients[1]).toMatchObject({
      amount: '28 g',
      baseAmount: 28,
      baseUnit: 'g',
    })
    expect(updated.totals.calories).toBeGreaterThan(300)
  })

  it('converts oz adjustments against gram baselines', () => {
    const recipe = buildReusableMealRecipe({
      name: 'Yogurt bowl',
      components: [
        {
          name: 'Greek yogurt',
          amount: '170 g',
          calories: 100,
          protein: 18,
          carbs: 6,
          fat: 0,
        },
      ],
    })
    const adjustments = buildReusableMealAdjustments(recipe).map((item) => ({
      ...item,
      amount: '6',
      unit: 'oz',
    }))
    const result = calculateReusableMealTotals(recipe, adjustments)

    expect(result.ingredients[0].adjustedAmount).toBe('6 oz')
    expect(result.totals.calories).toBeCloseTo(100, 0)
  })
})
