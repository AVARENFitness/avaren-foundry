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
