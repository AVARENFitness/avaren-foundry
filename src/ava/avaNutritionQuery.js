import {
  DEFAULT_NUTRITION_GOALS,
  nutritionDateKey,
  nutritionTotals,
  remainingNutrition,
} from '../lib/nutrition'
import { isNutritionQuery } from '../lib/avaConversationalRouter'

const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ')

export { isNutritionQuery }

export function answerNutritionQuery(
  message = '',
  nutrition = {},
  date = nutritionDateKey(),
) {
  const text = normalize(message)
  if (!text || !isNutritionQuery(text)) return null

  const day = nutrition?.days?.[date] ?? null
  const totals = nutritionTotals(day)
  const goals = { ...DEFAULT_NUTRITION_GOALS, ...(nutrition?.goals ?? {}) }
  const foods = day?.foods ?? []
  const hasLogged = foods.length > 0
  const remaining = remainingNutrition(goals, totals, day)

  if (
    /\b(what have i eaten|what did i eat|what've i logged|what did i log|logged today)\b/.test(
      text,
    )
  ) {
    if (!hasLogged) {
      return {
        summary:
          "I don't have any food logged for you today yet.",
      }
    }

    const labels = foods.map((entry) => {
      const servings = Number(entry.servings ?? 1)
      return servings > 1 ? `${servings}× ${entry.name}` : entry.name
    })

    return {
      summary: `Today you've logged ${labels.join(', ')}.`,
    }
  }

  if (/\b(protein left|protein do i have left|protein remaining|protein to go)\b/.test(text)) {
    if (!hasLogged) {
      return {
        summary:
          "I don't have enough logged today to estimate what's left on protein.",
      }
    }

    if (remaining.protein <= 0) {
      return {
        summary: `You're at ${Math.round(totals.protein)}g protein today — already at or above your ${goals.protein}g target.`,
      }
    }

    return {
      summary: `You've logged ${Math.round(totals.protein)}g protein today, with about ${Math.round(remaining.protein)}g left toward your ${goals.protein}g target.`,
    }
  }

  if (/\bprotein\b/.test(text)) {
    if (!hasLogged || totals.protein <= 0) {
      return {
        summary:
          "I don't have enough logged today to give you a useful protein total.",
      }
    }

    if (goals.protein) {
      return {
        summary: `You're at ${Math.round(totals.protein)}g of ${goals.protein}g today.`,
      }
    }

    return {
      summary: `You're at ${Math.round(totals.protein)}g protein today.`,
    }
  }

  if (/\bcalories left|calories remaining\b/.test(text)) {
    if (!hasLogged) {
      return {
        summary:
          "I don't have enough logged today to estimate remaining calories.",
      }
    }

    if (remaining.calories <= 0) {
      return {
        summary: `You're at ${Math.round(totals.calories)} calories logged today — at or above your ${goals.calories} target.`,
      }
    }

    return {
      summary: `You've logged ${Math.round(totals.calories)} calories today, with about ${Math.round(remaining.calories)} left toward your ${goals.calories} target.`,
    }
  }

  if (/\bcalories\b/.test(text)) {
    if (!hasLogged || totals.calories <= 0) {
      return {
        summary:
          "I don't have enough logged today to give you a useful calorie total.",
      }
    }

    if (goals.calories) {
      return {
        summary: `You're at ${Math.round(totals.calories).toLocaleString()} of ${goals.calories.toLocaleString()} calories today.`,
      }
    }

    return {
      summary: `You've logged ${Math.round(totals.calories).toLocaleString()} calories today.`,
    }
  }

  if (/\bnutrition\b/.test(text)) {
    if (!hasLogged) {
      return {
        summary:
          "I don't have enough logged today to give you a useful nutrition read.",
      }
    }

    return {
      summary: `Today so far: ${Math.round(totals.calories)} calories and ${Math.round(totals.protein)}g protein logged.`,
    }
  }

  return null
}
