export const AVA_INTENTS = {
  MESSAGE: 'message',
  FOOD: 'food',
  WORKOUT: 'workout',
  WEIGHT: 'weight',
  WATER: 'water',
  SUGGESTIONS: 'suggestions',
  UNKNOWN: 'unknown',
}

export const AVA_INTENT_LABELS = {
  [AVA_INTENTS.MESSAGE]: 'General question',
  [AVA_INTENTS.FOOD]: 'Food logging',
  [AVA_INTENTS.WORKOUT]: 'Workout guidance',
  [AVA_INTENTS.WEIGHT]: 'Weight tracking',
  [AVA_INTENTS.WATER]: 'Hydration',
  [AVA_INTENTS.SUGGESTIONS]: 'Suggestions',
  [AVA_INTENTS.UNKNOWN]: 'Unknown',
}

const FOOD_KEYWORDS = [
  'food',
  'meal',
  'eat',
  'ate',
  'calorie',
  'protein',
  'macro',
  'breakfast',
  'lunch',
  'dinner',
  'snack',
]

const WORKOUT_KEYWORDS = [
  'workout',
  'train',
  'lift',
  'set',
  'rep',
  'exercise',
  'program',
  'session',
  'gym',
]

const WEIGHT_KEYWORDS = ['weight', 'weigh', 'scale', 'lbs', 'lb', 'kg']

const WATER_KEYWORDS = [
  'water',
  'hydrate',
  'hydration',
  'oz',
  'ounce',
  'liter',
  'litre',
  'bottle',
]

const normalize = (value = '') => String(value).trim().toLowerCase()

const includesKeyword = (text, keywords) =>
  keywords.some((keyword) => text.includes(keyword))

export function detectIntent(message = '') {
  const text = normalize(message)

  if (!text) return AVA_INTENTS.UNKNOWN
  if (includesKeyword(text, FOOD_KEYWORDS)) return AVA_INTENTS.FOOD
  if (includesKeyword(text, WORKOUT_KEYWORDS)) return AVA_INTENTS.WORKOUT
  if (includesKeyword(text, WEIGHT_KEYWORDS)) return AVA_INTENTS.WEIGHT
  if (includesKeyword(text, WATER_KEYWORDS)) return AVA_INTENTS.WATER

  return AVA_INTENTS.MESSAGE
}
