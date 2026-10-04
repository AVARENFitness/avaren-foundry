import {
  DEFAULT_NUTRITION_GOALS,
  emptyNutritionDay,
  nutritionDateKey,
} from './nutrition'
import { createRuntimeId } from './createRuntimeId'

export const nutritionRound = (value) =>
  Math.round(Number(value || 0) * 10) / 10

export function buildFoodEntry(food, source = 'manual', entryId = null) {
  const servings = Number(food.servings || 1)

  return {
    id: entryId ?? createRuntimeId(),
    source,
    name: food.name.trim(),
    servings,
    calories: nutritionRound(Number(food.calories || 0) * servings),
    protein: nutritionRound(Number(food.protein || 0) * servings),
    carbs: nutritionRound(Number(food.carbs || 0) * servings),
    fat: nutritionRound(Number(food.fat || 0) * servings),
    fiber: nutritionRound(Number(food.fiber || 0) * servings),
    loggedAt: new Date().toISOString(),
  }
}

export function appendFoodToNutrition(
  nutrition,
  date = nutritionDateKey(),
  food,
  source = 'manual',
) {
  if (!food?.name?.trim()) {
    throw new Error('Food name is required.')
  }

  const entry = buildFoodEntry(food, source)
  const currentDay = nutrition?.days?.[date] ?? emptyNutritionDay(date)
  const foodId = food.id ?? `${source}:${food.name}`

  return {
    nutrition: {
      ...nutrition,
      recentFoodIds: [
        foodId,
        ...(nutrition?.recentFoodIds ?? []).filter((id) => id !== foodId),
      ].slice(0, 30),
      days: {
        ...(nutrition?.days ?? {}),
        [date]: {
          ...currentDay,
          foods: [...(currentDay.foods ?? []), entry],
        },
      },
    },
    entry,
  }
}

export function appendMultipleFoodsToNutrition(
  nutrition,
  date = nutritionDateKey(),
  items = [],
) {
  return items.reduce(
    (current, item) => {
      const result = appendFoodToNutrition(
        current.nutrition,
        date,
        item.food,
        item.source,
      )
      return {
        nutrition: result.nutrition,
        entries: [...current.entries, result.entry],
      }
    },
    { nutrition, entries: [] },
  )
}

export function addWaterToNutrition(
  nutrition,
  date = nutritionDateKey(),
  ounces,
) {
  const currentDay = nutrition?.days?.[date] ?? emptyNutritionDay(date)
  const added = nutritionRound(Number(ounces || 0))
  const previous = nutritionRound(Number(currentDay.waterOz || 0))

  return {
    nutrition: {
      ...nutrition,
      days: {
        ...(nutrition?.days ?? {}),
        [date]: {
          ...currentDay,
          waterOz: nutritionRound(previous + added),
        },
      },
    },
    addedOz: added,
    previousOz: previous,
  }
}

export function setWeightOnNutrition(
  nutrition,
  date = nutritionDateKey(),
  weight,
) {
  const currentDay = nutrition?.days?.[date] ?? emptyNutritionDay(date)
  const nextWeight = String(weight ?? '').trim()
  const previousWeight = String(currentDay.weight ?? '')

  return {
    nutrition: {
      ...nutrition,
      days: {
        ...(nutrition?.days ?? {}),
        [date]: {
          ...currentDay,
          weight: nextWeight,
        },
      },
    },
    previousWeight,
    nextWeight,
  }
}

export function logRecipeToNutrition(
  nutrition,
  date = nutritionDateKey(),
  recipe,
  amount = 1,
) {
  const servings = Math.max(1, Number(recipe.servings || 1))
  const multiplier = Math.max(0.01, Number(amount || 1))
  const totals =
    recipe.totals ??
    (recipe.ingredients ?? []).reduce(
      (sum, item) => ({
        calories:
          sum.calories +
          Number(item.calories || 0) * Number(item.multiplier || 1),
        protein:
          sum.protein +
          Number(item.protein || 0) * Number(item.multiplier || 1),
        carbs:
          sum.carbs +
          Number(item.carbs || 0) * Number(item.multiplier || 1),
        fat:
          sum.fat + Number(item.fat || 0) * Number(item.multiplier || 1),
        fiber:
          sum.fiber +
          Number(item.fiber || 0) * Number(item.multiplier || 1),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    )

  const foodPayload = {
    id: recipe.id,
    name: recipe.name,
    calories: Number(totals.calories || 0) / servings,
    protein: Number(totals.protein || 0) / servings,
    carbs: Number(totals.carbs || 0) / servings,
    fat: Number(totals.fat || 0) / servings,
    fiber: Number(totals.fiber || 0) / servings,
    servings: multiplier,
  }

  const foodResult = appendFoodToNutrition(
    nutrition,
    date,
    foodPayload,
    'recipe',
  )

  return {
    ...foodResult,
    nutrition: {
      ...foodResult.nutrition,
      recipes: (foodResult.nutrition.recipes ?? []).map((item) =>
        item.id === recipe.id
          ? {
              ...item,
              remainingServings: Math.max(
                0,
                nutritionRound(
                  Number(item.remainingServings ?? item.servings ?? 0) -
                    multiplier,
                ),
              ),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    },
  }
}

export function cloneNutritionState(nutrition) {
  return structuredClone(
    nutrition ?? {
      goals: DEFAULT_NUTRITION_GOALS,
      days: {},
      savedFoods: [],
      recipes: [],
      recentFoodIds: [],
      favoriteFoodIds: [],
    },
  )
}

export function createNutritionUndoSnapshot(
  nutrition,
  date = nutritionDateKey(),
) {
  return {
    date,
    nutrition: cloneNutritionState(nutrition),
    createdAt: new Date().toISOString(),
  }
}

export function restoreNutritionUndoSnapshot(nutrition, undoSnapshot) {
  if (!undoSnapshot?.nutrition) return nutrition
  return cloneNutritionState(undoSnapshot.nutrition)
}

export function removeFoodEntriesFromNutrition(
  nutrition,
  date = nutritionDateKey(),
  entryIds = [],
) {
  const ids = new Set(entryIds)
  const currentDay = nutrition?.days?.[date] ?? emptyNutritionDay(date)

  return {
    nutrition: {
      ...nutrition,
      days: {
        ...(nutrition?.days ?? {}),
        [date]: {
          ...currentDay,
          foods: (currentDay.foods ?? []).filter((entry) => !ids.has(entry.id)),
        },
      },
    },
    removedIds: entryIds.filter((id) =>
      (currentDay.foods ?? []).some((entry) => entry.id === id),
    ),
  }
}

export function replaceFoodEntriesInNutrition(
  nutrition,
  date = nutritionDateKey(),
  entryIds = [],
  replacementFood,
  source = 'catalog',
) {
  const without = removeFoodEntriesFromNutrition(nutrition, date, entryIds)
  return appendFoodToNutrition(without.nutrition, date, replacementFood, source)
}


export function appendFatSecretFoodReference(
  nutrition,
  date = nutritionDateKey(),
  {
    foodId,
    servingId,
    quantity = 1,
    servingSnapshot = null,
  } = {},
) {
  const resolvedFoodId = String(foodId ?? '').trim()
  const resolvedServingId = String(servingId ?? '').trim()
  const resolvedQuantity = Math.max(0.01, Number(quantity || 1))

  if (!resolvedFoodId || !resolvedServingId) {
    throw new Error('FatSecret food and serving are required.')
  }

  const currentDay = nutrition?.days?.[date] ?? emptyNutritionDay(date)
  const snapshot = servingSnapshot
    ? {
        name: String(servingSnapshot.name ?? '').trim(),
        brand: String(servingSnapshot.brand ?? '').trim(),
        serving: String(servingSnapshot.serving ?? '').trim(),
        calories: nutritionRound(
          Number(servingSnapshot.calories || 0) * resolvedQuantity,
        ),
        protein: nutritionRound(
          Number(servingSnapshot.protein || 0) * resolvedQuantity,
        ),
        carbs: nutritionRound(
          Number(servingSnapshot.carbs || 0) * resolvedQuantity,
        ),
        fat: nutritionRound(
          Number(servingSnapshot.fat || 0) * resolvedQuantity,
        ),
        fiber: nutritionRound(
          Number(servingSnapshot.fiber || 0) * resolvedQuantity,
        ),
      }
    : {}

  const entry = {
    id: createRuntimeId(),
    source: 'fatsecret',
    provider: 'fatsecret',
    fatSecret: {
      foodId: resolvedFoodId,
      servingId: resolvedServingId,
    },
    quantity: resolvedQuantity,
    ...snapshot,
    loggedAt: new Date().toISOString(),
  }

  return {
    nutrition: {
      ...nutrition,
      recentFoodIds: [
        `fatsecret:${resolvedFoodId}`,
        ...(nutrition?.recentFoodIds ?? []).filter(
          (id) => id !== `fatsecret:${resolvedFoodId}`,
        ),
      ].slice(0, 30),
      days: {
        ...(nutrition?.days ?? {}),
        [date]: {
          ...currentDay,
          foods: [...(currentDay.foods ?? []), entry],
        },
      },
    },
    entry,
  }
}


export const needsFatSecretNutritionSnapshot = (food = null) =>
  Boolean(
    food?.source === 'fatsecret' &&
      food?.fatSecret?.foodId &&
      food?.fatSecret?.servingId &&
      !Object.prototype.hasOwnProperty.call(food, 'calories'),
  )

export const hydrateFatSecretNutritionSnapshot = (
  food,
  detail,
) => {
  if (!needsFatSecretNutritionSnapshot(food) || !detail) return food

  const serving = detail?.servings?.find(
    (item) =>
      String(item.servingId) === String(food.fatSecret.servingId),
  )
  if (!serving) return food

  const quantity = Math.max(0.01, Number(food.quantity || 1))

  return {
    ...food,
    name: String(detail.name ?? 'FatSecret food').trim(),
    brand: String(detail.brand ?? '').trim(),
    serving: String(serving.description ?? '').trim(),
    calories: nutritionRound(Number(serving.calories || 0) * quantity),
    protein: nutritionRound(Number(serving.protein || 0) * quantity),
    carbs: nutritionRound(Number(serving.carbs || 0) * quantity),
    fat: nutritionRound(Number(serving.fat || 0) * quantity),
    fiber: nutritionRound(Number(serving.fiber || 0) * quantity),
  }
}

