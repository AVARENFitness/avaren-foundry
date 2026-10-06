import {
  FOOD_MEASURE_UNIT,
  convertFoodMeasureAmount,
  normalizeFoodMeasureUnit,
  parseFoodServingMeasurement,
} from './nutritionMeasurement'

const num = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const round = (value) => Math.round(num(value) * 10) / 10

const normalizeComponentMeasurement = (amountText = '') => {
  const parsed = parseFoodServingMeasurement(amountText)
  if (!parsed) return null
  return {
    amount: Number(parsed.amount),
    unit: normalizeFoodMeasureUnit(parsed.unit),
  }
}

export const buildReusableMealRecipe = ({
  name,
  components = [],
  totals = {},
  context = '',
  sourceImageKind = 'meal',
} = {}) => {
  const ingredients = (components ?? []).map((component, index) => {
    const measurement = normalizeComponentMeasurement(component.amount)
    return {
      id: `scan-component-${index}-${Date.now()}`,
      name: String(component.name ?? `Component ${index + 1}`).trim(),
      amount: String(component.amount ?? '').trim(),
      baseAmount: measurement?.amount ?? null,
      baseUnit: measurement?.unit ?? null,
      multiplier: 1,
      calories: round(component.calories),
      protein: round(component.protein),
      carbs: round(component.carbs),
      fat: round(component.fat),
      fiber: round(component.fiber),
      basis: component.basis ?? 'visual_estimate',
    }
  })

  const derivedTotals = ingredients.length
    ? ingredients.reduce(
        (sum, item) => ({
          calories: sum.calories + num(item.calories),
          protein: sum.protein + num(item.protein),
          carbs: sum.carbs + num(item.carbs),
          fat: sum.fat + num(item.fat),
          fiber: sum.fiber + num(item.fiber),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      )
    : {
        calories: num(totals.calories),
        protein: num(totals.protein),
        carbs: num(totals.carbs),
        fat: num(totals.fat),
        fiber: num(totals.fiber),
      }

  return {
    id: `ava-meal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: String(name ?? 'Saved meal').trim() || 'Saved meal',
    source: 'ava_scan',
    reusableMeal: true,
    trackInventory: false,
    servings: 1,
    remainingServings: null,
    ingredients,
    totals: Object.fromEntries(
      Object.entries(derivedTotals).map(([key, value]) => [key, round(value)]),
    ),
    context: String(context ?? '').trim(),
    sourceImageKind,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export const buildReusableMealAdjustments = (recipe = {}) =>
  (recipe.ingredients ?? []).map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    amount:
      ingredient.baseAmount != null
        ? String(ingredient.baseAmount)
        : String(ingredient.multiplier ?? 1),
    unit: ingredient.baseUnit ?? FOOD_MEASURE_UNIT.SERVING,
  }))

export const calculateReusableMealTotals = (
  recipe = {},
  adjustments = [],
) => {
  const byId = Object.fromEntries(
    (adjustments ?? []).map((item) => [item.id, item]),
  )

  const ingredients = (recipe.ingredients ?? []).map((ingredient) => {
    const adjustment = byId[ingredient.id] ?? null
    let multiplier = 1
    let displayAmount = ingredient.amount ?? ''

    if (ingredient.baseAmount != null && ingredient.baseUnit) {
      const requestedAmount = num(adjustment?.amount)
      const requestedUnit =
        normalizeFoodMeasureUnit(adjustment?.unit) ?? ingredient.baseUnit
      const inBaseUnit = convertFoodMeasureAmount(
        requestedAmount,
        requestedUnit,
        ingredient.baseUnit,
      )
      multiplier =
        requestedAmount > 0 && inBaseUnit != null
          ? inBaseUnit / Number(ingredient.baseAmount)
          : 1
      displayAmount = `${round(requestedAmount)} ${requestedUnit}`
    } else if (adjustment) {
      multiplier = Math.max(0.01, num(adjustment.amount) || 1)
      displayAmount =
        multiplier === 1
          ? ingredient.amount || '1 serving'
          : `${round(multiplier)}× ${ingredient.amount || ingredient.name}`
    }

    return {
      ...ingredient,
      adjustedMultiplier: multiplier,
      adjustedAmount: displayAmount,
      calories: round(num(ingredient.calories) * multiplier),
      protein: round(num(ingredient.protein) * multiplier),
      carbs: round(num(ingredient.carbs) * multiplier),
      fat: round(num(ingredient.fat) * multiplier),
      fiber: round(num(ingredient.fiber) * multiplier),
    }
  })

  const totals = ingredients.reduce(
    (sum, item) => ({
      calories: sum.calories + num(item.calories),
      protein: sum.protein + num(item.protein),
      carbs: sum.carbs + num(item.carbs),
      fat: sum.fat + num(item.fat),
      fiber: sum.fiber + num(item.fiber),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  )

  return {
    ingredients,
    totals: Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, round(value)]),
    ),
  }
}


export const buildReusableMealIngredientFromFood = (
  food = {},
  { id = null } = {},
) => {
  const servingBasis =
    food.servingBasis ??
    (() => {
      const parsed = parseFoodServingMeasurement(
        food.serving ??
          food.description ??
          food.servingDescription ??
          '',
      )
      return parsed
        ? { amount: parsed.amount, unit: parsed.unit }
        : null
    })()

  return {
    id:
      id ??
      `meal-food-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: String(food.name ?? 'Ingredient').trim() || 'Ingredient',
    amount: servingBasis
      ? `${round(servingBasis.amount)} ${servingBasis.unit}`
      : String(food.serving ?? '1 serving'),
    baseAmount: servingBasis?.amount ?? null,
    baseUnit: servingBasis?.unit ?? null,
    multiplier: 1,
    calories: round(food.calories),
    protein: round(food.protein),
    carbs: round(food.carbs),
    fat: round(food.fat),
    fiber: round(food.fiber),
    basis: food.basis ?? 'database',
  }
}

export const applyReusableMealPreviewToRecipe = (
  recipe = {},
  preview = null,
) => {
  if (!preview) return recipe

  return {
    ...recipe,
    ingredients: (preview.ingredients ?? []).map((ingredient) => {
      const measurement = normalizeComponentMeasurement(
        ingredient.adjustedAmount,
      )
      return {
        ...ingredient,
        amount: ingredient.adjustedAmount ?? ingredient.amount ?? '',
        baseAmount: measurement?.amount ?? null,
        baseUnit: measurement?.unit ?? null,
        multiplier: 1,
        calories: round(ingredient.calories),
        protein: round(ingredient.protein),
        carbs: round(ingredient.carbs),
        fat: round(ingredient.fat),
        fiber: round(ingredient.fiber),
        adjustedMultiplier: undefined,
        adjustedAmount: undefined,
      }
    }),
    totals: Object.fromEntries(
      Object.entries(preview.totals ?? {}).map(([key, value]) => [
        key,
        round(value),
      ]),
    ),
    updatedAt: new Date().toISOString(),
  }
}
