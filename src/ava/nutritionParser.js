import { COMMON_FOODS } from '../data/commonFoods'
import { DEFAULT_NUTRITION_GOALS, nutritionTotals } from '../lib/nutrition'
import { nutritionRound } from '../lib/nutritionActions'

const WORD_NUMBERS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  half: 0.5,
  'one-half': 0.5,
  quarter: 0.25,
  'one-quarter': 0.25,
  'one-third': 1 / 3,
}

const FOOD_ALIASES = {
  toast: ['toast', 'bread'],
  eggs: ['egg', 'eggs'],
  shake: ['shake', 'fairlife'],
}

const DIRECT_FOOD_IDS = {
  toast: 'bread',
  eggs: 'egg',
  egg: 'egg',
}

export const AVA_CONFIDENCE = {
  HIGH: 'high',
  MEDIUM: 'medium',
  NEEDS_CLARIFICATION: 'needs-clarification',
}

const normalize = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s./-]/g, ' ')
    .replace(/\s+/g, ' ')

const tokenize = (value = '') =>
  normalize(value)
    .split(' ')
    .filter(Boolean)

export function parseQuantity(text = '') {
  const normalized = normalize(text)

  const phraseEntries = Object.entries(WORD_NUMBERS).sort(
    (left, right) => right[0].length - left[0].length,
  )

  for (const [word, amount] of phraseEntries) {
    const pattern = new RegExp(`\\b${word.replace('-', '[- ]')}\\b`)
    if (pattern.test(normalized)) return amount
  }

  const numericMatch = normalized.match(
    /\b(\d+(?:\.\d+)?)\s*(?:x|servings?|serving|bottles?|bottle|oz|ounces?|lbs?|pounds?)?\b/,
  )
  if (numericMatch) {
    return Number(numericMatch[1])
  }

  if (/\b(a|an|one)\b/.test(normalized)) return 1

  return 1
}

function buildFoodIndex(nutrition = {}) {
  const favoriteIds = new Set(nutrition.favoriteFoodIds ?? [])
  const recentIds = nutrition.recentFoodIds ?? []

  const saved = (nutrition.savedFoods ?? []).map((food) => ({
    ...food,
    matchType: 'saved',
    source: 'saved',
  }))

  const catalog = COMMON_FOODS.map((food) => ({
    ...food,
    matchType: 'catalog',
    source: 'catalog',
  }))

  const recipes = (nutrition.recipes ?? []).map((recipe) => ({
    ...recipe,
    matchType: 'recipe',
    source: 'recipe',
    isRecipe: true,
  }))

  const combined = [...saved, ...recipes, ...catalog]

  return combined.map((item) => {
    let priority = 0
    if (favoriteIds.has(item.id)) priority += 40
    const recentIndex = recentIds.indexOf(item.id)
    if (recentIndex !== -1) priority += Math.max(0, 20 - recentIndex)
    if (item.matchType === 'saved') priority += 12
    if (item.matchType === 'recipe') priority += 10
    return { ...item, priority }
  })
}

function scoreFoodMatch(item, queryTokens = []) {
  if (!queryTokens.length) return 0

  const haystack = normalize(
    `${item.name} ${item.brand ?? ''} ${item.keywords ?? ''}`,
  )
  const tokens = haystack.split(' ').filter(Boolean)
  let score = item.priority ?? 0

  for (const queryToken of queryTokens) {
    if (tokens.includes(queryToken)) score += 18
    else if (haystack.includes(queryToken)) score += 10
  }

  for (const [aliasKey, aliasTokens] of Object.entries(FOOD_ALIASES)) {
    if (queryTokens.includes(aliasKey) || queryTokens.some((t) => aliasTokens.includes(t))) {
      if (haystack.includes(aliasKey) || aliasTokens.some((alias) => haystack.includes(alias))) {
        score += 14
      }
    }
  }

  if (item.isRecipe && queryTokens.includes('my')) score += 8

  return score
}

export function searchFoodMatches(nutrition, query, { limit = 6 } = {}) {
  const queryTokens = tokenize(query)
  if (!queryTokens.length) return []

  return buildFoodIndex(nutrition)
    .map((item) => ({
      item,
      score: scoreFoodMatch(item, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function stripLeadingPhrases(text = '') {
  return normalize(text)
    .replace(/^(i|we)\s+(had|ate|eat|eaten|drank|drink|log|logged|weigh|weight)\s+/i, '')
    .replace(/^(had|ate|drank|log|logged|weigh)\s+/i, '')
    .trim()
}

function detectWaterMessage(message = '', nutrition = {}) {
  const text = normalize(message)
  if (!/(water|hydrate|hydration|bottle|drank|drink)/.test(text)) return null

  const goals = { ...DEFAULT_NUTRITION_GOALS, ...(nutrition.goals ?? {}) }
  const bottleMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounces?|bottles?)/)
  if (bottleMatch) {
    return {
      type: 'water',
      ounces: Number(bottleMatch[1]),
      confidence: AVA_CONFIDENCE.HIGH,
    }
  }

  if (/\b(half|one-half|1\/2)\b/.test(text) && /bottle/.test(text)) {
    return {
      type: 'water',
      ounces: nutritionRound(Number(goals.bottleOz || 33.8) / 2),
      confidence: AVA_CONFIDENCE.HIGH,
    }
  }

  if (/\b(one|a|an|1)\b/.test(text) && /bottle/.test(text)) {
    return {
      type: 'water',
      ounces: Number(goals.bottleOz || 33.8),
      confidence: AVA_CONFIDENCE.HIGH,
    }
  }

  const genericOz = text.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounces?)/)
  if (genericOz) {
    return {
      type: 'water',
      ounces: Number(genericOz[1]),
      confidence: AVA_CONFIDENCE.MEDIUM,
    }
  }

  return null
}

function detectWeightMessage(message = '') {
  const text = normalize(message)
  const weighMatch = text.match(
    /\bweigh(?:t)?\s*(?:is|at|of)?\s*(\d+(?:\.\d+)?)\b/,
  )
  if (weighMatch) {
    return {
      type: 'weight',
      value: weighMatch[1],
      confidence: AVA_CONFIDENCE.HIGH,
    }
  }

  if (/\bweight\b/.test(text)) {
    const valueMatch = text.match(/(\d+(?:\.\d+)?)/)
    if (valueMatch) {
      return {
        type: 'weight',
        value: valueMatch[1],
        confidence: AVA_CONFIDENCE.MEDIUM,
      }
    }
  }

  return null
}

function detectRecipeMessage(message = '', nutrition = {}) {
  const text = normalize(message)
  const recipeLead =
    /(?:half|one-half|one-quarter|quarter|one-third|\d+(?:\.\d+)?|one|two|three)\s+(?:of\s+)?(?:my\s+)?(.+)/.exec(
      text,
    )

  if (!recipeLead && !/\bmy\b/.test(text)) return null

  const query = recipeLead?.[1] ?? stripLeadingPhrases(text)
  const recipeMatches = searchFoodMatches(nutrition, query, { limit: 4 }).filter(
    (entry) => entry.item.isRecipe,
  )

  if (!recipeMatches.length) return null

  const quantity = parseQuantity(text)
  const top = recipeMatches[0]
  const second = recipeMatches[1]

  if (
    second &&
    top.score - second.score < 12 &&
    !recipeLead?.[0]?.includes('my')
  ) {
    return {
      type: 'clarify',
      confidence: AVA_CONFIDENCE.NEEDS_CLARIFICATION,
      query,
      choices: recipeMatches.slice(0, 3).map((entry) => entry.item),
      quantity,
    }
  }

  return {
    type: 'recipe',
    recipe: top.item,
    servings: quantity,
    confidence:
      top.score >= 40 ? AVA_CONFIDENCE.HIGH : AVA_CONFIDENCE.MEDIUM,
  }
}

function splitFoodSegments(message = '') {
  const cleaned = stripLeadingPhrases(message)
  return cleaned
    .split(/\s+and\s+|\s*,\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function resolveFoodSegment(nutrition, segment) {
  const quantity = parseQuantity(segment)
  const query = normalize(segment)
    .replace(/^(one|two|three|four|five|half|quarter|a|an|\d+(?:\.\d+)?)\s+/i, '')
    .replace(/^(large|medium|small)\s+/i, '')
    .replace(/\s+(serving|servings)$/i, '')
    .trim()

  const directId = DIRECT_FOOD_IDS[query]
  if (directId) {
    const directMatch = buildFoodIndex(nutrition).find((item) => item.id === directId)
    if (directMatch) {
      return {
        confidence: AVA_CONFIDENCE.HIGH,
        food: directMatch,
        source: directMatch.source,
        quantity,
      }
    }
  }

  const matches = searchFoodMatches(nutrition, query, { limit: 4 }).filter(
    (entry) => !entry.item.isRecipe,
  )

  if (!matches.length) {
    return {
      confidence: AVA_CONFIDENCE.NEEDS_CLARIFICATION,
      query,
      quantity,
      choices: [],
    }
  }

  const top = matches[0]
  const second = matches[1]

  if (second && top.score - second.score < 12) {
    return {
      confidence: AVA_CONFIDENCE.NEEDS_CLARIFICATION,
      query,
      quantity,
      choices: matches.slice(0, 3).map((entry) => entry.item),
    }
  }

  return {
    confidence:
      top.score >= 42
        ? AVA_CONFIDENCE.HIGH
        : top.score >= 24
          ? AVA_CONFIDENCE.MEDIUM
          : AVA_CONFIDENCE.NEEDS_CLARIFICATION,
    food: top.item,
    source: top.item.source,
    quantity,
  }
}

export function interpretNutritionMessage(message = '', nutrition = {}, options = {}) {
  const text = String(message ?? '').trim()
  if (!text) {
    return { handled: false }
  }

  if (options.selectedChoice) {
    const quantity = parseQuantity(text)
    const item = options.selectedChoice
    if (item.isRecipe) {
      return finalizeRecipeInterpretation(item, quantity, AVA_CONFIDENCE.HIGH)
    }
    return finalizeFoodInterpretation(
      [{ food: item, source: item.source, quantity }],
      AVA_CONFIDENCE.HIGH,
      text,
    )
  }

  const water = detectWaterMessage(text, nutrition)
  if (water) {
    return finalizeWaterInterpretation(water, nutrition, text)
  }

  const weight = detectWeightMessage(text)
  if (weight) {
    return finalizeWeightInterpretation(weight, text)
  }

  const recipe = detectRecipeMessage(text, nutrition)
  if (recipe?.type === 'clarify') {
    return finalizeClarification(recipe, text)
  }
  if (recipe?.type === 'recipe') {
    return finalizeRecipeInterpretation(
      recipe.recipe,
      recipe.servings,
      recipe.confidence,
      text,
    )
  }

  const segments = splitFoodSegments(text)
  const resolvedSegments = segments.map((segment) =>
    resolveFoodSegment(nutrition, segment),
  )

  const clarifySegment = resolvedSegments.find(
    (segment) =>
      segment.confidence === AVA_CONFIDENCE.NEEDS_CLARIFICATION &&
      segment.choices?.length,
  )

  if (clarifySegment) {
    return finalizeClarification(
      {
        type: 'clarify',
        confidence: AVA_CONFIDENCE.NEEDS_CLARIFICATION,
        query: clarifySegment.query,
        choices: clarifySegment.choices,
        quantity: clarifySegment.quantity,
      },
      text,
    )
  }

  const foodItems = resolvedSegments
    .filter((segment) => segment.food)
    .map((segment) => ({
      food: segment.food,
      source: segment.source,
      quantity: segment.quantity,
    }))

  if (!foodItems.length) {
    return { handled: false }
  }

  const confidence = resolvedSegments.some(
    (segment) => segment.confidence === AVA_CONFIDENCE.NEEDS_CLARIFICATION,
  )
    ? AVA_CONFIDENCE.NEEDS_CLARIFICATION
    : resolvedSegments.some(
          (segment) => segment.confidence === AVA_CONFIDENCE.MEDIUM,
        )
      ? AVA_CONFIDENCE.MEDIUM
      : AVA_CONFIDENCE.HIGH

  return finalizeFoodInterpretation(foodItems, confidence, text)
}

function scaledFoodPayload(food, quantity, source) {
  const servings = Number(quantity || 1)
  return {
    food: {
      id: food.id,
      name: food.name,
      calories: Number(food.calories || 0),
      protein: Number(food.protein || 0),
      carbs: Number(food.carbs || 0),
      fat: Number(food.fat || 0),
      fiber: Number(food.fiber || 0),
      servings,
    },
    source,
  }
}

function estimateFoodTotals(items = []) {
  return items.reduce(
    (totals, item) => ({
      calories:
        totals.calories +
        Number(item.food.calories || 0) * Number(item.food.servings || 1),
      protein:
        totals.protein +
        Number(item.food.protein || 0) * Number(item.food.servings || 1),
      carbs:
        totals.carbs +
        Number(item.food.carbs || 0) * Number(item.food.servings || 1),
      fat:
        totals.fat +
        Number(item.food.fat || 0) * Number(item.food.servings || 1),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

function confidenceLabel(confidence) {
  if (confidence === AVA_CONFIDENCE.HIGH) return 'Confidence · High'
  if (confidence === AVA_CONFIDENCE.MEDIUM) return 'Confidence · Medium'
  return 'Needs clarification'
}

function finalizeClarification(payload, message) {
  return {
    handled: true,
    intent: 'food',
    confidence: payload.confidence,
    summary: `Which “${payload.query}” did you mean?`,
    requiresConfirmation: false,
    clarification: {
      query: payload.query,
      quantity: payload.quantity ?? 1,
      choices: payload.choices.slice(0, 3),
    },
    action: null,
    message,
  }
}

function finalizeWaterInterpretation(water, nutrition, message) {
  const goals = { ...DEFAULT_NUTRITION_GOALS, ...(nutrition.goals ?? {}) }
  return {
    handled: true,
    intent: 'water',
    confidence: water.confidence,
    summary: `Log ${nutritionRound(water.ounces)} oz of water for today?`,
    requiresConfirmation: true,
    action: {
      type: 'log-water',
      ounces: water.ounces,
    },
    preview: {
      title: 'Log hydration?',
      actionLabel: 'Add water',
      confidenceLabel: confidenceLabel(water.confidence),
      items: [{ label: 'Hydration', value: `${nutritionRound(water.ounces)} oz` }],
      estimates: [{ label: 'Bottle size', value: `${goals.bottleOz} oz` }],
    },
    message,
  }
}

function finalizeWeightInterpretation(weight, message) {
  return {
    handled: true,
    intent: 'weight',
    confidence: weight.confidence,
    summary: `Log ${weight.value} as today’s weight?`,
    requiresConfirmation: true,
    action: {
      type: 'log-weight',
      value: weight.value,
    },
    preview: {
      title: 'Log body weight?',
      actionLabel: 'Save weight',
      confidenceLabel: confidenceLabel(weight.confidence),
      items: [{ label: 'Weight', value: `${weight.value} lb` }],
      estimates: [],
    },
    message,
  }
}

function finalizeRecipeInterpretation(recipe, servings, confidence, message) {
  const batchServings = Math.max(1, Number(recipe.servings || 1))
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
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    )

  const perServing = {
    calories: Number(totals.calories || 0) / batchServings,
    protein: Number(totals.protein || 0) / batchServings,
    carbs: Number(totals.carbs || 0) / batchServings,
    fat: Number(totals.fat || 0) / batchServings,
  }

  return {
    handled: true,
    intent: 'recipe',
    confidence,
    summary: `Log ${servings} serving${servings === 1 ? '' : 's'} of ${recipe.name}?`,
    requiresConfirmation: true,
    action: {
      type: 'log-recipe',
      recipe,
      servings,
    },
    preview: {
      title: 'Log this recipe serving?',
      actionLabel: 'Log recipe',
      confidenceLabel: confidenceLabel(confidence),
      items: [
        { label: 'Recipe', value: recipe.name },
        {
          label: 'Serving',
          value: `${servings} serving${servings === 1 ? '' : 's'}`,
        },
      ],
      estimates: [
        {
          label: 'Calories',
          value: String(
            nutritionRound(perServing.calories * Number(servings || 1)),
          ),
        },
        {
          label: 'Protein',
          value: `${nutritionRound(perServing.protein * Number(servings || 1))}g`,
        },
      ],
    },
    message,
  }
}

function finalizeFoodInterpretation(items, confidence, message) {
  const scaledItems = items.map((item) =>
    scaledFoodPayload(item.food, item.quantity, item.source),
  )
  const totals = estimateFoodTotals(scaledItems)
  const names = scaledItems
    .map(
      (item) =>
        `${item.food.servings > 1 ? `${item.food.servings}× ` : ''}${item.food.name}`,
    )
    .join(' and ')

  return {
    handled: true,
    intent: 'food',
    confidence,
    summary: `Log ${names} for today?`,
    requiresConfirmation: confidence !== AVA_CONFIDENCE.NEEDS_CLARIFICATION,
    action: {
      type: 'log-food',
      items: scaledItems,
    },
    preview: {
      title: 'Log this meal?',
      actionLabel: 'Log food',
      confidenceLabel: confidenceLabel(confidence),
      items: scaledItems.map((item) => ({
        label: item.food.name,
        value: `${item.food.servings} serving${item.food.servings === 1 ? '' : 's'}`,
      })),
      estimates: [
        { label: 'Calories', value: String(nutritionRound(totals.calories)) },
        { label: 'Protein', value: `${nutritionRound(totals.protein)}g` },
        { label: 'Carbs', value: `${nutritionRound(totals.carbs)}g` },
        { label: 'Fat', value: `${nutritionRound(totals.fat)}g` },
      ],
    },
    message,
  }
}

export function summarizeNutritionDay(nutrition, date) {
  const day = nutrition?.days?.[date]
  return nutritionTotals(day)
}
