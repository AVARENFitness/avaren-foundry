import { COMMON_FOODS } from '../data/commonFoods'
import {
  nutritionDateKey,
  nutritionTotals,
} from '../lib/nutrition'
import { applyAvaNutritionAction } from './applyAvaNutritionAction'
import {
  AVA_CONFIDENCE,
  classifyFoodQuerySpecificity,
  getUnsupportedProductAttributes,
  isExplicitPastTenseConsumption,
} from './nutritionParser'

export const AVA_NUTRITION_ACTION_TYPES = {
  LOG_FOOD: 'log-food',
  LOG_WATER: 'log-water',
  LOG_WEIGHT: 'log-weight',
  LOG_RECIPE: 'log-recipe',
}

const ALLOWED_ACTION_TYPES = new Set(Object.values(AVA_NUTRITION_ACTION_TYPES))

const executedFingerprints = new Map()
const executedTransactionIds = new Set()
const FINGERPRINT_TTL_MS = 15000

const debugLog = (...args) => {
  if (import.meta.env?.DEV) {
    console.debug('[ava-nutrition]', ...args)
  }
}

export { isExplicitPastTenseConsumption }

export const shouldAutoExecuteNutrition = (interpretation = {}, message = '') => {
  if (!interpretation?.action?.type) return false
  if (interpretation.clarification) return false

  const query = String(message || interpretation.message || '')
    .trim()
    .replace(/^(i|we)\s+(had|ate|eat|eaten|drank|drink|log|logged|add|track)\s+(a|an|one|two|three|four|five|\d+(?:\.\d+)?)?\s*/i, '')
    .trim()

  const profile = classifyFoodQuerySpecificity(query)
  if (profile.specificity === 'broad_category') return false

  if (interpretation.action.type === AVA_NUTRITION_ACTION_TYPES.LOG_FOOD) {
    const food = interpretation.action.items?.[0]?.food
    if (food) {
      const unsupported = getUnsupportedProductAttributes(query, food)
      if (
        profile.specificity !== 'exact_match' &&
        unsupported.some((entry) => !entry.startsWith('product:'))
      ) {
        return false
      }
    }
  }

  if (interpretation.autoExecute) return true
  if (interpretation.confidence !== AVA_CONFIDENCE.HIGH) return false
  return isExplicitPastTenseConsumption(message || interpretation.message)
}

const findTrustedCatalogFood = (foodId, nutrition = {}) => {
  if (!foodId) return null

  const saved = (nutrition.savedFoods ?? []).find((item) => item.id === foodId)
  if (saved) return { ...saved, source: 'saved' }

  const catalog = COMMON_FOODS.find((item) => item.id === foodId)
  if (catalog) return { ...catalog, source: 'catalog' }

  return null
}

const findTrustedRecipe = (recipeId, nutrition = {}) =>
  (nutrition.recipes ?? []).find((item) => item.id === recipeId) ?? null

export const validateNutritionAction = (action = {}, nutrition = {}) => {
  if (!action?.type || !ALLOWED_ACTION_TYPES.has(action.type)) {
    return { ok: false, reason: 'unsupported-action' }
  }

  switch (action.type) {
    case AVA_NUTRITION_ACTION_TYPES.LOG_FOOD: {
      const items = Array.isArray(action.items) ? action.items : []
      if (!items.length) {
        return { ok: false, reason: 'missing-items' }
      }

      const sanitizedItems = []

      for (const item of items) {
        const food = item?.food ?? {}
        const servings = Number(food.servings ?? 1)

        if (!food?.name?.trim()) {
          return { ok: false, reason: 'missing-food-name' }
        }

        if (!Number.isFinite(servings) || servings <= 0 || servings > 20) {
          return { ok: false, reason: 'invalid-quantity' }
        }

        const trusted = findTrustedCatalogFood(food.id, nutrition)
        if (food.id && !trusted) {
          return { ok: false, reason: 'unknown-food-id' }
        }

        const sourceFood = trusted ?? food
        sanitizedItems.push({
          food: {
            id: sourceFood.id ?? food.id,
            name: sourceFood.name ?? food.name,
            calories: Number(sourceFood.calories ?? 0),
            protein: Number(sourceFood.protein ?? 0),
            carbs: Number(sourceFood.carbs ?? 0),
            fat: Number(sourceFood.fat ?? 0),
            fiber: Number(sourceFood.fiber ?? 0),
            servings,
          },
          source: item.source ?? sourceFood.source ?? 'catalog',
        })
      }

      return {
        ok: true,
        action: {
          type: AVA_NUTRITION_ACTION_TYPES.LOG_FOOD,
          items: sanitizedItems,
        },
      }
    }

    case AVA_NUTRITION_ACTION_TYPES.LOG_WATER: {
      const ounces = Number(action.ounces)
      if (!Number.isFinite(ounces) || ounces <= 0 || ounces > 200) {
        return { ok: false, reason: 'invalid-water-amount' }
      }
      return {
        ok: true,
        action: { type: AVA_NUTRITION_ACTION_TYPES.LOG_WATER, ounces },
      }
    }

    case AVA_NUTRITION_ACTION_TYPES.LOG_WEIGHT: {
      const value = String(action.value ?? '').trim()
      if (!value || !/^\d+(\.\d+)?$/.test(value)) {
        return { ok: false, reason: 'invalid-weight' }
      }
      return {
        ok: true,
        action: { type: AVA_NUTRITION_ACTION_TYPES.LOG_WEIGHT, value },
      }
    }

    case AVA_NUTRITION_ACTION_TYPES.LOG_RECIPE: {
      const recipe = action.recipe
      const servings = Number(action.servings ?? 1)
      const trustedRecipe = findTrustedRecipe(recipe?.id, nutrition)

      if (!trustedRecipe) {
        return { ok: false, reason: 'unknown-recipe' }
      }

      if (!Number.isFinite(servings) || servings <= 0 || servings > 20) {
        return { ok: false, reason: 'invalid-quantity' }
      }

      return {
        ok: true,
        action: {
          type: AVA_NUTRITION_ACTION_TYPES.LOG_RECIPE,
          recipe: trustedRecipe,
          servings,
        },
      }
    }

    default:
      return { ok: false, reason: 'unsupported-action' }
  }
}

export const createNutritionTransactionFingerprint = (
  action = {},
  date = nutritionDateKey(),
) => {
  switch (action.type) {
    case AVA_NUTRITION_ACTION_TYPES.LOG_FOOD:
      return `${date}:${action.type}:${(action.items ?? [])
        .map((item) => `${item.food?.id ?? item.food?.name}:${item.food?.servings ?? 1}`)
        .join('|')}`
    case AVA_NUTRITION_ACTION_TYPES.LOG_WATER:
      return `${date}:${action.type}:${action.ounces}`
    case AVA_NUTRITION_ACTION_TYPES.LOG_WEIGHT:
      return `${date}:${action.type}:${action.value}`
    case AVA_NUTRITION_ACTION_TYPES.LOG_RECIPE:
      return `${date}:${action.type}:${action.recipe?.id}:${action.servings}`
    default:
      return `${date}:${action.type}`
  }
}

export const hasRecentNutritionFingerprint = (fingerprint) => {
  const stamp = executedFingerprints.get(fingerprint)
  if (!stamp) return false
  if (Date.now() - stamp > FINGERPRINT_TTL_MS) {
    executedFingerprints.delete(fingerprint)
    return false
  }
  return true
}

export const markNutritionFingerprint = (fingerprint) => {
  executedFingerprints.set(fingerprint, Date.now())
}

export const clearNutritionTransactionFingerprints = () => {
  executedFingerprints.clear()
  executedTransactionIds.clear()
}

export const hasExecutedTransactionId = (transactionId) =>
  Boolean(transactionId && executedTransactionIds.has(transactionId))

export const markExecutedTransactionId = (transactionId) => {
  if (transactionId) executedTransactionIds.add(transactionId)
}

export const buildNutritionSuccessMessage = ({
  action,
  applied,
  nutritionAfter,
  date = nutritionDateKey(),
} = {}) => {
  if (action?.type === AVA_NUTRITION_ACTION_TYPES.LOG_FOOD) {
    const names = (applied?.entries ?? [])
      .map((entry) => entry.name)
      .filter(Boolean)
    const label = names.length ? names.join(' and ') : 'that food'
    const totals = nutritionTotals(nutritionAfter?.days?.[date])
    const proteinGoal = Number(nutritionAfter?.goals?.protein ?? 170)

    if (totals.protein > 0 && proteinGoal > 0) {
      return `Got it — I logged ${label}. You're at ${Math.round(totals.protein)}g protein today.`
    }

    return `Got it — I logged ${label}.`
  }

  return applied?.toastMessage ?? 'Logged.'
}

export const buildNutritionFailureMessage = () =>
  "I couldn't save that one. Want to try again?"

export function executeNutritionTransaction({
  nutrition,
  action,
  date = nutritionDateKey(),
  fingerprint = null,
  allowDuplicate = false,
  transactionId = null,
} = {}) {
  debugLog('validate', action?.type)

  const validated = validateNutritionAction(action, nutrition)
  if (!validated.ok) {
    debugLog('rejected', validated.reason)
    return {
      ok: false,
      reason: validated.reason,
      summary: buildNutritionFailureMessage(),
    }
  }

  const resolvedFingerprint =
    fingerprint ?? createNutritionTransactionFingerprint(validated.action, date)

  if (
    !allowDuplicate &&
    transactionId &&
    hasExecutedTransactionId(transactionId)
  ) {
    debugLog('duplicate-transaction-id', transactionId)
    return {
      ok: false,
      reason: 'duplicate-transaction',
      summary: buildNutritionFailureMessage(),
    }
  }

  if (!allowDuplicate && hasRecentNutritionFingerprint(resolvedFingerprint)) {
    debugLog('duplicate-blocked', resolvedFingerprint)
    return {
      ok: false,
      reason: 'duplicate-transaction',
      summary: buildNutritionFailureMessage(),
    }
  }

  try {
    debugLog('execute', validated.action.type)
    const applied = applyAvaNutritionAction(
      nutrition,
      validated.action,
      date,
    )

    markNutritionFingerprint(resolvedFingerprint)
    if (transactionId) markExecutedTransactionId(transactionId)

    debugLog('success', {
      foods: applied.nutrition?.days?.[date]?.foods?.length ?? 0,
    })

    return {
      ok: true,
      nutrition: applied.nutrition,
      undo: applied.undo,
      applied,
      action: validated.action,
      fingerprint: resolvedFingerprint,
      transactionId: transactionId ?? resolvedFingerprint,
      summary: buildNutritionSuccessMessage({
        action: validated.action,
        applied,
        nutritionAfter: applied.nutrition,
        date,
      }),
    }
  } catch (error) {
    debugLog('failure', error?.message)
    return {
      ok: false,
      reason: 'execution-error',
      summary: buildNutritionFailureMessage(),
    }
  }
}

export function executeNutritionInterpretation({
  nutrition,
  interpretation,
  date = nutritionDateKey(),
  allowDuplicate = false,
  transactionId = null,
} = {}) {
  if (!interpretation?.action) {
    return {
      ok: false,
      reason: 'missing-action',
      summary: buildNutritionFailureMessage(),
    }
  }

  return executeNutritionTransaction({
    nutrition,
    action: interpretation.action,
    date,
    allowDuplicate,
    transactionId,
  })
}
