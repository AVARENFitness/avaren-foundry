const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ')

export const AVA_ROUTE_INTENTS = {
  CONVERSATION: 'conversation',
  WORKOUT: 'workout',
  READINESS: 'readiness',
  RECOVERY: 'recovery',
  NUTRITION_QUERY: 'nutrition_query',
  NUTRITION_LOG: 'nutrition_log',
  PROGRESS: 'progress',
  STATE_STATEMENT: 'state_statement',
  UNKNOWN: 'unknown',
}

const STATE_STATEMENT_PATTERNS = [
  /\b(i'm|i am|im)\s+(feeling\s+)?(tired|exhausted|sore|run down|beat up|flat|worn out|drained|rough|pretty good|good|great|not feeling it)\b/,
  /\b(i'm|i am|im)\s+(tired|exhausted|sore|hungry)\b/,
  /\bfeeling\s+(tired|exhausted|sore|pretty good|good|great|flat|run down|worn out|rough)\b/,
  /\b(don't|do not)\s+(feel like training|have much energy|really feel like)\b/,
  /\bmy legs feel heavy\b/,
  /\bnot feeling it today\b/,
  /\blow on energy\b/,
  /\bno energy\b/,
  /\bmy .{0,60}(hurt|hurting|sore|pain|aches?|aching|heavy|tight)\b/,
  /\b(i'm|i am|im) not feeling (great|good|100|it)\b/,
  /\b(feel|feels|feeling) (hurt|hurting|sore|heavy|tight|off|rough|bad)\b/,
  /\b(is|are) (hurt|hurting|sore|painful|heavy|tight)\b/,
  /\b(having|have) (some )?(soreness|pain|discomfort)\b/,
  /\b(chest|shoulder|back|leg|knee|hip|arm|delt|quad|hamstring).{0,24}(hurt|hurting|sore|pain)\b/,
  /\b(hurt|hurting|sore|pain).{0,24}(chest|shoulder|delt|leg|arm|back)\b/,
]

const NUTRITION_LOG_PATTERNS = [
  /^(i|we)\s+(had|ate|eat|eaten|drank|drink)\b/,
  /^(had|ate|drank|log|logged|track|add)\b/,
  /\b(log|track|add)\s+(a|an|my|the|\d+|one|two|three|half)\b/,
  /\bfind\s+(chicken|protein|rice|shrimp|bar|bowl|food|eggs?)\b/,
]

const NUTRITION_QUERY_PATTERNS = [
  /\bhow much protein have i had\b/,
  /\bhow much protein did i\b/,
  /\bhow much protein today\b/,
  /\bwhat(?:'s| is) my protein\b/,
  /\bprotein have i had today\b/,
  /\bprotein today\b/,
  /\bprotein did i eat\b/,
  /\bhow am i doing on protein\b/,
  /\bhow much protein do i have left\b/,
  /\bprotein left today\b/,
  /\bhow many calories have i logged\b/,
  /\bhow many calories did i\b/,
  /\bhow many calories today\b/,
  /\bwhat are my calories today\b/,
  /\bcalories have i had\b/,
  /\bcalories left today\b/,
  /\bwhat have i eaten today\b/,
  /\bwhat did i eat today\b/,
  /\bwhat have i logged today\b/,
  /\bnutrition this week\b/,
  /\bdo i need to eat more\b/,
]

const WATER_LOG_PATTERNS = [
  /\b(water|hydrate|hydration|bottle|drank|drink)\b/,
]

const WEIGHT_LOG_PATTERNS = [
  /\bweigh(?:t)?\s*(?:is|at|of)?\s*\d+/,
  /\bweight\b.*\d+/,
]

const REFERENT_FOLLOW_UP_PATTERNS = [
  /^why\??$/,
  /\b(it|this|that)\b/,
  /should i still/,
  /still do/,
  /what about the workout/,
  /what should i change/,
  /what should i do/,
  /can i just do half/,
]

const SESSION_CONSTRAINT_PATTERNS = [
  /\bonly have \d+ minutes\b/,
  /\bkeep it lighter\b/,
  /\btraining at home\b/,
  /\bjust do half\b/,
  /\bhalf workout\b/,
]

export const isExplicitNutritionLogIntent = (message = '') => {
  const text = normalize(message)
  if (!text) return false

  if (NUTRITION_LOG_PATTERNS.some((pattern) => pattern.test(text))) {
    return true
  }

  if (WATER_LOG_PATTERNS.some((pattern) => pattern.test(text))) {
    return /\b(log|logged|track|add|drank|drink|bottle|\d+\s*oz)\b/.test(text)
  }

  if (WEIGHT_LOG_PATTERNS.some((pattern) => pattern.test(text))) {
    return true
  }

  return false
}

export const isStateStatement = (message = '') => {
  const text = normalize(message)
  if (!text) return false
  return STATE_STATEMENT_PATTERNS.some((pattern) => pattern.test(text))
}

export const isNutritionQuery = (message = '') => {
  const text = normalize(message)
  if (!text) return false
  return NUTRITION_QUERY_PATTERNS.some((pattern) => pattern.test(text))
}

export const isSessionConstraintStatement = (message = '') => {
  const text = normalize(message)
  if (!text) return false
  return SESSION_CONSTRAINT_PATTERNS.some((pattern) => pattern.test(text))
}

const hasActiveConversationContext = (session = null) =>
  Boolean(
    session?.topic ||
      session?.lastRecommendation ||
      session?.userConstraints?.length,
  )

const isReferentFollowUp = (text = '') =>
  REFERENT_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(text))

export const classifyAvaIntent = (message = '', context = {}) => {
  const text = normalize(message)
  const session = context.session ?? null

  if (!text) {
    return {
      intent: AVA_ROUTE_INTENTS.UNKNOWN,
      confidence: 'low',
      requiresTool: false,
      entities: {},
    }
  }

  if (hasActiveConversationContext(session) && isReferentFollowUp(text)) {
    return {
      intent: AVA_ROUTE_INTENTS.CONVERSATION,
      confidence: 'high',
      requiresTool: false,
      entities: { followUp: true },
    }
  }

  if (isStateStatement(text) && !isExplicitNutritionLogIntent(text)) {
    return {
      intent: AVA_ROUTE_INTENTS.STATE_STATEMENT,
      confidence: 'high',
      requiresTool: false,
      entities: { subjective: true },
    }
  }

  if (isNutritionQuery(text)) {
    return {
      intent: AVA_ROUTE_INTENTS.NUTRITION_QUERY,
      confidence: 'high',
      requiresTool: false,
      entities: { domain: 'nutrition' },
    }
  }

  if (isExplicitNutritionLogIntent(text)) {
    return {
      intent: AVA_ROUTE_INTENTS.NUTRITION_LOG,
      confidence: 'high',
      requiresTool: true,
      entities: { domain: 'nutrition' },
    }
  }

  if (hasNutritionLoggingShape(text)) {
    return {
      intent: AVA_ROUTE_INTENTS.NUTRITION_LOG,
      confidence: 'medium',
      requiresTool: true,
      entities: { domain: 'nutrition' },
    }
  }

  if (isSessionConstraintStatement(text)) {
    return {
      intent: AVA_ROUTE_INTENTS.CONVERSATION,
      confidence: 'high',
      requiresTool: false,
      entities: { constraint: true },
    }
  }

  return {
    intent: AVA_ROUTE_INTENTS.CONVERSATION,
    confidence: 'medium',
    requiresTool: false,
    entities: {},
  }
}

export const hasNutritionLoggingShape = (message = '') => {
  const text = normalize(message)
  if (!text || isStateStatement(text)) return false

  if (isExplicitNutritionLogIntent(text)) return true

  if (/^(one|two|three|four|five|half|a|an|\d+(?:\.\d+)?)\s+\S/.test(text)) {
    return true
  }

  if (/^my\s+\S/.test(text)) {
    return !/\b(hurt|hurting|sore|pain|aches?|aching|heavy|tight|delt|shoulder|leg|knee|hip|chest|arm|back)\b/.test(
      text,
    )
  }

  return false
}

export const shouldRunNutritionTool = (message = '', context = {}) => {
  if (!hasNutritionLoggingShape(message)) return false

  const classification = classifyAvaIntent(message, context)
  return (
    classification.intent === AVA_ROUTE_INTENTS.NUTRITION_LOG &&
    classification.requiresTool
  )
}

export const shouldShowNutritionDisambiguation = (
  message = '',
  nutritionResult = {},
  context = {},
) => {
  if (!nutritionResult?.clarification) return false
  if (!shouldRunNutritionTool(message, context)) return false
  return nutritionResult.confidence === 'needs-clarification'
}
