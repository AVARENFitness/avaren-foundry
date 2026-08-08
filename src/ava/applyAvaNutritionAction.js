import { nutritionDateKey } from '../lib/nutrition'
import {
  addWaterToNutrition,
  appendMultipleFoodsToNutrition,
  appendFoodToNutrition,
  createNutritionUndoSnapshot,
  logRecipeToNutrition,
  restoreNutritionUndoSnapshot,
  setWeightOnNutrition,
} from '../lib/nutritionActions'

export function applyAvaNutritionAction(
  nutrition,
  action,
  date = nutritionDateKey(),
) {
  const undo = createNutritionUndoSnapshot(nutrition, date)

  if (!action?.type) {
    throw new Error('Missing AVA nutrition action.')
  }

  switch (action.type) {
    case 'log-food': {
      const result = appendMultipleFoodsToNutrition(
        nutrition,
        date,
        action.items ?? [],
      )
      return {
        nutrition: result.nutrition,
        entries: result.entries,
        undo,
        toastMessage: `Logged ${result.entries.map((entry) => entry.name).join(' and ')}.`,
      }
    }
    case 'log-water': {
      const result = addWaterToNutrition(nutrition, date, action.ounces)
      return {
        nutrition: result.nutrition,
        undo,
        toastMessage: `Added ${result.addedOz} oz of water.`,
      }
    }
    case 'log-weight': {
      const result = setWeightOnNutrition(nutrition, date, action.value)
      return {
        nutrition: result.nutrition,
        undo,
        toastMessage: `Saved today’s weight: ${result.nextWeight} lb.`,
      }
    }
    case 'log-recipe': {
      const result = logRecipeToNutrition(
        nutrition,
        date,
        action.recipe,
        action.servings,
      )
      return {
        nutrition: result.nutrition,
        undo,
        toastMessage: `Logged ${action.servings} serving${action.servings === 1 ? '' : 's'} of ${action.recipe.name}.`,
      }
    }
    default:
      throw new Error(`Unsupported AVA nutrition action: ${action.type}`)
  }
}

export function undoAvaNutritionAction(nutrition, undoSnapshot) {
  return {
    nutrition: restoreNutritionUndoSnapshot(nutrition, undoSnapshot),
    toastMessage: 'Last AVA nutrition action undone.',
  }
}
